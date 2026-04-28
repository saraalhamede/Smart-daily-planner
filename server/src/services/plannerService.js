import { analyzeMoodEnergy, categorizeTask } from '../logic/ai.js';
import { generateDailySchedule } from '../logic/scheduler.js';
import { createId } from '../utils/id.js';
import { createHttpError } from '../utils/httpError.js';
import { getStore } from '../data/store.js';

const store = await getStore();

export async function getBootstrap(userId) {
  const [
    user,
    preferences,
    dailyLogs,
    tasks,
    schedules
  ] = await Promise.all([
    store.getUser(userId),
    store.getUserPreferences(userId),
    store.listDailyLogs(userId),
    store.listTasks(userId),
    store.listSchedules(userId)
  ]);

  const latestSchedule = latestRecord(schedules, 'generated_at');
  const latestItems = latestSchedule
    ? await store.listScheduleItems(latestSchedule.schedule_id)
    : [];

  return {
    user,
    preferences,
    latest_daily_log: latestRecord(dailyLogs),
    tasks,
    latest_schedule: latestSchedule,
    latest_schedule_items: latestItems
  };
}

export async function getTasks(userId) {
  return store.listTasks(userId);
}

export async function createDailyLog(input) {
  const record = {
    log_id: createId('log'),
    user_id: input.user_id || 'user_demo',
    log_date: input.log_date || new Date().toISOString().slice(0, 10),
    mood_level: parseInteger(input.mood_level, 3),
    energy_level: parseInteger(input.energy_level, 3),
    stress_level: parseInteger(input.stress_level, 3),
    sleep_hours: Number.parseFloat(input.sleep_hours) || 7,
    is_tired: Boolean(input.is_tired),
    planning_start: input.planning_start || null,
    planning_end: input.planning_end || null,
    mood_text_original: input.mood_text_original || '',
    ...analyzeMoodEnergy(input),
    created_at: new Date().toISOString()
  };

  return store.insertDailyLog(record);
}

export async function createTask(input) {
  const enriched = categorizeTask(input);
  const task = {
    task_id: createId('task'),
    user_id: input.user_id || 'user_demo',
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    ...enriched,
    priority_level: parseInteger(input.priority_level, 3),
    remaining_duration_minutes: enriched.estimated_duration_minutes,
    deadline: input.deadline || null,
    status: 'pending',
    is_completed: false,
    is_fixed_time: Boolean(input.is_fixed_time),
    fixed_date: input.is_fixed_time ? input.fixed_date || null : null,
    fixed_start_time: input.is_fixed_time ? input.fixed_start_time || null : null,
    fixed_end_time: input.is_fixed_time ? input.fixed_end_time || null : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (!task.title) {
    throw createHttpError(400, 'Task title is required.');
  }

  if (task.is_fixed_time) {
    validateFixedTask(task);
    const fixedTasks = await store.listFixedTasks(task.user_id, task.fixed_date);
    const conflict = findFixedConflict(fixedTasks, task);
    if (conflict) {
      throw createHttpError(409, `This fixed-time task overlaps with "${conflict.title}".`);
    }
  }

  return store.insertTask(task);
}

export async function generateSchedule(input) {
  const userId = input.user_id || 'user_demo';
  const context = await loadScheduleContext(userId, input.daily_log_id);

  if (!context.dailyLog) {
    throw createHttpError(400, 'Please save a daily check-in before generating the schedule.');
  }

  const draft = generateDailySchedule({
    userId,
    dailyLog: context.dailyLog,
    preferences: context.preferences,
    tasks: context.tasks,
    feedback: context.feedback
  });

  return saveSchedule(userId, context.dailyLog.log_id, draft, 'active');
}

export async function submitFeedback(input) {
  const feedback = {
    feedback_id: createId('feedback'),
    user_id: input.user_id || 'user_demo',
    task_id: input.task_id,
    schedule_item_id: input.schedule_item_id || null,
    completed: Boolean(input.completed),
    actual_duration_minutes: parseOptionalInteger(input.actual_duration_minutes),
    difficulty_feedback: parseOptionalInteger(input.difficulty_feedback),
    energy_after: parseOptionalInteger(input.energy_after),
    mood_after: parseOptionalInteger(input.mood_after),
    comment: input.comment || '',
    created_at: new Date().toISOString()
  };

  if (!feedback.task_id) {
    throw createHttpError(400, 'task_id is required.');
  }

  await store.insertFeedback(feedback);
  await updateTaskFromFeedback(feedback);

  const reschedule = await rescheduleAfterFeedback(feedback);
  return {
    feedback,
    updated_schedule: reschedule?.schedule || null,
    updated_items: reschedule?.items || []
  };
}

async function loadScheduleContext(userId, dailyLogId) {
  const [preferences, dailyLogs, tasks, feedback] = await Promise.all([
    store.getUserPreferences(userId),
    store.listDailyLogs(userId),
    store.listTasks(userId),
    store.listFeedback(userId)
  ]);

  const dailyLog = dailyLogId
    ? dailyLogs.find((item) => item.log_id === dailyLogId)
    : latestRecord(dailyLogs);

  return { preferences, dailyLog, tasks, feedback };
}

async function updateTaskFromFeedback(feedback) {
  const task = await store.getTask(feedback.task_id);
  if (!task) return;

  const currentRemaining = parseInteger(task.remaining_duration_minutes, task.estimated_duration_minutes || 0);
  const actualDuration = feedback.actual_duration_minutes || 0;
  const updates = { updated_at: new Date().toISOString() };

  if (feedback.completed) {
    Object.assign(updates, {
      is_completed: true,
      status: 'completed',
      remaining_duration_minutes: 0
    });
  } else {
    Object.assign(updates, {
      is_completed: false,
      status: 'pending',
      remaining_duration_minutes: Math.max(15, currentRemaining - actualDuration || Math.ceil(currentRemaining * 0.5))
    });
  }

  if (feedback.difficulty_feedback) {
    updates.difficulty_level = Math.max(task.difficulty_level || 1, feedback.difficulty_feedback);
  }

  await store.updateTask(task.task_id, updates);
}

async function rescheduleAfterFeedback(feedback) {
  if (!feedback.schedule_item_id) return null;

  const sourceItem = await store.getScheduleItem(feedback.schedule_item_id);
  if (!sourceItem) return null;

  const sourceSchedule = await store.getSchedule(sourceItem.schedule_id);
  if (!sourceSchedule) return null;

  const dailyLog = await store.getDailyLog(sourceSchedule.daily_log_id);
  if (!dailyLog) return null;

  const [preferences, tasks, feedbackList] = await Promise.all([
    store.getUserPreferences(feedback.user_id),
    store.listTasks(feedback.user_id),
    store.listFeedback(feedback.user_id)
  ]);

  const draft = generateDailySchedule({
    userId: feedback.user_id,
    dailyLog,
    preferences,
    tasks,
    feedback: feedbackList,
    scheduleDate: sourceSchedule.schedule_date,
    rescheduleFrom: sourceItem.end_time,
    feedbackContext: feedback
  });

  return saveSchedule(feedback.user_id, dailyLog.log_id, draft, 'rescheduled');
}

async function saveSchedule(userId, dailyLogId, draft, status) {
  const schedule = {
    schedule_id: createId('schedule'),
    user_id: userId,
    daily_log_id: dailyLogId,
    schedule_date: draft.schedule_date,
    generated_at: new Date().toISOString(),
    status,
    schedule_note: draft.schedule_note
  };
  const items = draft.items.map((item) => ({
    schedule_item_id: createId('item'),
    schedule_id: schedule.schedule_id,
    ...item,
    status: 'planned',
    created_at: new Date().toISOString()
  }));

  await store.insertScheduleWithItems(schedule, items);
  return { schedule, items };
}

function validateFixedTask(task) {
  if (!task.fixed_date) throw createHttpError(400, 'Fixed-time tasks need a date.');
  if (!task.fixed_start_time || !task.fixed_end_time) {
    throw createHttpError(400, 'Fixed-time tasks need start and end times.');
  }
  if (task.fixed_start_time >= task.fixed_end_time) {
    throw createHttpError(400, 'Fixed-time task end time must be after the start time.');
  }
}

function findFixedConflict(existingTasks, newTask) {
  const newStart = `${newTask.fixed_date}T${newTask.fixed_start_time}:00`;
  const newEnd = `${newTask.fixed_date}T${newTask.fixed_end_time}:00`;

  return existingTasks.find((task) => {
    if (task.fixed_date !== newTask.fixed_date) return false;
    const currentStart = `${task.fixed_date}T${task.fixed_start_time}:00`;
    const currentEnd = `${task.fixed_date}T${task.fixed_end_time}:00`;
    return newStart < currentEnd && newEnd > currentStart;
  });
}

function latestRecord(records, field = 'created_at') {
  return [...records].sort((a, b) => new Date(b[field]) - new Date(a[field]))[0] || null;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
