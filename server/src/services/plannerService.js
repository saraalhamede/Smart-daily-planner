import crypto from 'node:crypto';
import { analyzeMoodEnergy, categorizeTask } from '../logic/ai.js';
import { generateDailySchedule } from '../logic/scheduler.js';
import { createId } from '../utils/id.js';
import { createHttpError } from '../utils/httpError.js';
import { getStore } from '../data/store.js';

const store = await getStore();

export async function getHealth() {
  const database = await store.healthCheck();
  return {
    status: database.connected ? 'ok' : 'error',
    server: 'ok',
    database
  };
}

export async function registerUser(input) {
  const fullName = String(input.full_name || `${input.first_name || ''} ${input.last_name || ''}`).trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password || '').trim();

  if (!fullName) throw createHttpError(400, 'Full name is required.');
  if (!email) throw createHttpError(400, 'Email is required.');
  if (password.length < 6) throw createHttpError(400, 'Password must be at least 6 characters.');

  const existing = await store.getUserByEmail(email);
  if (existing) throw createHttpError(409, 'This email is already registered.');

  const user = {
    user_id: createId('user'),
    full_name: fullName,
    email,
    password_hash: await hashPassword(password),
    profile_image: input.profile_image || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const preferences = buildDefaultPreferences(user.user_id);
  await store.insertUserWithPreferences(user, preferences);

  return buildAuthPayload(user, preferences);
}

export async function loginUser(input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '').trim();

  if (!email || !password) throw createHttpError(400, 'Email and password are required.');

  const user = await store.getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw createHttpError(401, 'Invalid email or password.');
  }

  const preferences = await store.getUserPreferences(user.user_id);
  return buildAuthPayload(user, preferences);
}

export async function updateUserProfile(userId, input) {
  const existing = await store.getUser(userId);
  if (!existing) throw createHttpError(404, 'User not found.');

  const updates = {
    full_name: input.full_name || `${input.first_name || ''} ${input.last_name || ''}`.trim() || undefined,
    email: input.email ? normalizeEmail(input.email) : undefined,
    profile_image: input.profile_image ?? undefined,
    updated_at: new Date().toISOString()
  };

  if (input.password) {
    if (String(input.password).trim().length < 6) {
      throw createHttpError(400, 'Password must be at least 6 characters.');
    }
    updates.password_hash = await hashPassword(String(input.password).trim());
  }

  const user = await store.updateUser(userId, cleanUndefined(updates));
  return { user: stripSensitiveUser(user) };
}

export async function getBootstrap(userId) {
  await autoTransitionFixedTasks(userId, todayKey());

  const [
    user,
    preferences,
    dailyLogs,
    tasks,
    schedules,
    scheduleItems,
    feedback,
    aiNotes,
    dailyEvaluations
  ] = await Promise.all([
    store.getUser(userId),
    store.getUserPreferences(userId),
    store.listDailyLogs(userId),
    store.listTasks(userId),
    store.listSchedules(userId),
    store.listAllScheduleItems(userId),
    store.listFeedback(userId),
    store.listAiNotes(userId),
    store.listDailyEvaluations(userId)
  ]);

  if (!user) throw createHttpError(404, 'User not found.');

  const latestSchedule = latestRecord(schedules, 'generated_at');
  const latestItems = latestSchedule
    ? scheduleItems.filter((item) => item.schedule_id === latestSchedule.schedule_id)
    : [];

  return {
    user: stripSensitiveUser(user),
    preferences,
    daily_logs: dailyLogs,
    daily_checkins: dailyLogs,
    latest_daily_log: latestRecord(dailyLogs),
    latest_daily_checkin: latestRecord(dailyLogs),
    tasks,
    schedules,
    schedule_items: scheduleItems,
    latest_schedule: latestSchedule,
    latest_schedule_items: latestItems,
    task_feedback: feedback,
    ai_notes: aiNotes,
    daily_evaluations: dailyEvaluations
  };
}

export async function getTasks(userId) {
  return store.listTasks(userId);
}

export async function getDailyCheckins(userId) {
  const dailyCheckins = await store.listDailyLogs(userId);
  return {
    daily_checkins: dailyCheckins,
    daily_logs: dailyCheckins
  };
}

export async function getTaskFeedback(userId) {
  return { task_feedback: await store.listFeedback(userId) };
}

export async function getUserPreferences(userId) {
  return { preferences: await store.getUserPreferences(userId) };
}

export async function getSchedules(userId) {
  const [schedules, scheduleItems, dailyEvaluations, aiNotes] = await Promise.all([
    store.listSchedules(userId),
    store.listAllScheduleItems(userId),
    store.listDailyEvaluations(userId),
    store.listAiNotes(userId)
  ]);

  return {
    schedules,
    schedule_items: scheduleItems,
    daily_evaluations: dailyEvaluations,
    ai_notes: aiNotes
  };
}

export async function getDailyDetails(userId, date) {
  if (!date) throw createHttpError(400, 'date is required.');
  await autoTransitionFixedTasks(userId, date);

  const [schedule, items, tasks, dailyLogs, feedback, aiNotes, dailyEvaluations] = await Promise.all([
    store.getScheduleByDate(userId, date),
    store.listScheduleItemsForDate(userId, date),
    store.listTasks(userId),
    store.listDailyLogs(userId),
    store.listFeedback(userId),
    store.listAiNotes(userId),
    store.listDailyEvaluations(userId)
  ]);

  return {
    schedule,
    items,
    schedule_items: items,
    tasks,
    daily_checkin: dailyLogs.find((log) => dateOnly(log.log_date) === date) || null,
    task_feedback: feedback.filter((item) => !item.schedule_item_id || items.some((scheduleItem) => scheduleItem.schedule_item_id === item.schedule_item_id)),
    ai_notes: aiNotes.filter((note) => dateOnly(note.note_date || note.created_at) === date),
    daily_evaluation: dailyEvaluations.find((evaluation) => dateOnly(evaluation.evaluation_date) === date) || null
  };
}

export async function getDayData(userId, date) {
  if (!date) throw createHttpError(400, 'date is required.');
  const [tasks, dailyLogs, schedule, items, aiNotes, dailyEvaluations] = await Promise.all([
    store.listTasks(userId),
    store.listDailyLogs(userId),
    store.getScheduleByDate(userId, date),
    store.listScheduleItemsForDate(userId, date),
    store.listAiNotes(userId),
    store.listDailyEvaluations(userId)
  ]);
  return {
    date,
    daily_checkin: dailyLogs.find((log) => dateOnly(log.log_date) === date) || null,
    daily_log: dailyLogs.find((log) => dateOnly(log.log_date) === date) || null,
    tasks: tasks.filter((task) => isTaskVisibleOnDate(task, date)),
    schedule,
    schedule_items: items,
    items,
    ai_notes: aiNotes.filter((note) => dateOnly(note.note_date || note.created_at) === date),
    daily_evaluation: dailyEvaluations.find((evaluation) => dateOnly(evaluation.evaluation_date) === date) || null
  };
}

export async function getScheduleForDate(userId, date) {
  if (!date) throw createHttpError(400, 'date is required.');
  const [schedule, items] = await Promise.all([
    store.getScheduleByDate(userId, date),
    store.listScheduleItemsForDate(userId, date)
  ]);
  return { schedule, items, schedule_items: items };
}

export async function getWeeklyDashboard(userId, date = todayKey()) {
  const weekDays = getWeekDayKeys(date);
  const weekSet = new Set(weekDays);
  const [tasks, scheduleItems, dailyLogs, dailyEvaluations] = await Promise.all([
    store.listTasks(userId),
    store.listAllScheduleItems(userId),
    store.listDailyLogs(userId),
    store.listDailyEvaluations(userId)
  ]);
  const evaluationByDate = new Map(dailyEvaluations.map((evaluation) => [dateOnly(evaluation.evaluation_date), evaluation]));
  const checkinByDate = new Map(dailyLogs.map((log) => [dateOnly(log.log_date), log]));
  const taskCounts = weekDays.map((dayKey) => {
    const dayTasks = tasks.filter((task) => isTaskVisibleOnDate(task, dayKey));
    const completed = dayTasks.filter((task) => Boolean(task.is_completed) || task.status === 'completed').length;
    const evaluation = evaluationByDate.get(dayKey);
    return {
      date: dayKey,
      total_tasks: dayTasks.length,
      completed_tasks: completed,
      completion_percentage: evaluation?.completion_percentage ?? (dayTasks.length ? Math.round((completed / dayTasks.length) * 100) : 0),
      productivity_score: evaluation?.productivity_score ?? null,
      stress_level: checkinByDate.get(dayKey)?.stress_level ?? null
    };
  });
  const scoredDays = taskCounts.map((day) => day.productivity_score).filter((score) => score !== null);

  return {
    date,
    week_start: weekDays[0],
    week_end: weekDays[weekDays.length - 1],
    days: taskCounts,
    unfinished_tasks: tasks.filter((task) => (
      !task.is_completed &&
      task.status !== 'completed' &&
      !['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase()) &&
      weekDays.some((dayKey) => isTaskVisibleOnDate(task, dayKey))
    )),
    weekly_productivity_score: scoredDays.length
      ? Math.round(scoredDays.reduce((sum, score) => sum + Number(score), 0) / scoredDays.length)
      : null,
    tasks,
    schedule_items: scheduleItems.filter((item) => weekSet.has(dateOnly(item.start_time))),
    daily_logs: dailyLogs.filter((log) => weekSet.has(dateOnly(log.log_date))),
    daily_checkins: dailyLogs.filter((log) => weekSet.has(dateOnly(log.log_date))),
    daily_evaluations: dailyEvaluations.filter((evaluation) => weekSet.has(dateOnly(evaluation.evaluation_date)))
  };
}

export async function getCalendarMonth(userId, month, year) {
  const now = new Date();
  const monthNumber = parseInteger(month, now.getMonth() + 1);
  const yearNumber = parseInteger(year, now.getFullYear());
  const firstDay = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-01`;
  const lastDate = new Date(yearNumber, monthNumber, 0);
  const lastDay = dateOnly(lastDate);
  const [tasks, scheduleItems, dailyLogs, dailyEvaluations] = await Promise.all([
    store.listTasks(userId),
    store.listAllScheduleItems(userId),
    store.listDailyLogs(userId),
    store.listDailyEvaluations(userId)
  ]);
  const days = [];
  for (let day = 1; day <= lastDate.getDate(); day += 1) {
    const key = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTasks = tasks.filter((task) => isTaskVisibleOnDate(task, key));
    const completed = dayTasks.filter((task) => Boolean(task.is_completed) || task.status === 'completed').length;
    const evaluation = dailyEvaluations.find((item) => dateOnly(item.evaluation_date) === key);
    const checkin = dailyLogs.find((item) => dateOnly(item.log_date) === key);
    days.push({
      date: key,
      task_count: dayTasks.length,
      deadline_count: dayTasks.filter((task) => task.deadline && !task.is_completed).length,
      completion_percentage: evaluation?.completion_percentage ?? (dayTasks.length ? Math.round((completed / dayTasks.length) * 100) : 0),
      productivity_score: evaluation?.productivity_score ?? null,
      mood_level: checkin?.mood_level ?? null,
      stress_level: checkin?.stress_level ?? null
    });
  }

  return {
    month: monthNumber,
    year: yearNumber,
    start_date: firstDay,
    end_date: lastDay,
    days,
    tasks,
    schedule_items: scheduleItems.filter((item) => {
      const key = dateOnly(item.start_time);
      return key >= firstDay && key <= lastDay;
    }),
    daily_logs: dailyLogs.filter((log) => {
      const key = dateOnly(log.log_date);
      return key >= firstDay && key <= lastDay;
    }),
    daily_checkins: dailyLogs.filter((log) => {
      const key = dateOnly(log.log_date);
      return key >= firstDay && key <= lastDay;
    }),
    daily_evaluations: dailyEvaluations.filter((evaluation) => {
      const key = dateOnly(evaluation.evaluation_date);
      return key >= firstDay && key <= lastDay;
    })
  };
}

export async function getAiNotes(userId, period = 'weekly') {
  const startDate = getPeriodStartKey(period);
  const [aiNotes, dailyLogs, feedback, dailyEvaluations] = await Promise.all([
    store.listAiNotes(userId),
    store.listDailyLogs(userId),
    store.listFeedback(userId),
    store.listDailyEvaluations(userId)
  ]);
  return {
    period,
    ai_notes: aiNotes.filter((note) => dateOnly(note.note_date || note.created_at) >= startDate),
    daily_logs: dailyLogs.filter((log) => dateOnly(log.log_date || log.created_at) >= startDate),
    daily_checkins: dailyLogs.filter((log) => dateOnly(log.log_date || log.created_at) >= startDate),
    task_feedback: feedback.filter((item) => dateOnly(item.created_at) >= startDate),
    daily_evaluations: dailyEvaluations.filter((evaluation) => dateOnly(evaluation.evaluation_date) >= startDate)
  };
}

export async function getProgressSummary(userId, period = 'weekly') {
  const startDate = getPeriodStartKey(period);
  const [tasks, scheduleItems, dailyLogs, feedback, dailyEvaluations] = await Promise.all([
    store.listTasks(userId),
    store.listAllScheduleItems(userId),
    store.listDailyLogs(userId),
    store.listFeedback(userId),
    store.listDailyEvaluations(userId)
  ]);
  const filteredTasks = tasks.filter((task) => (dateOnly(task.completed_on || task.completed_at || task.task_date || task.created_at) || todayKey()) >= startDate);
  const completedTasks = filteredTasks.filter((task) => Boolean(task.is_completed) || task.status === 'completed');
  const plannedMinutes = scheduleItems
    .filter((item) => dateOnly(item.start_time) >= startDate)
    .reduce((sum, item) => sum + getDurationMinutes(item.start_time, item.end_time), 0);
  const actualMinutes = scheduleItems
    .filter((item) => dateOnly(item.start_time) >= startDate)
    .reduce((sum, item) => sum + (parseOptionalInteger(item.actual_duration_minutes) || 0), 0);

  return {
    period,
    completed_tasks: completedTasks.length,
    unfinished_tasks: filteredTasks.length - completedTasks.length,
    completion_percentage: filteredTasks.length ? Math.round((completedTasks.length / filteredTasks.length) * 100) : 0,
    planned_minutes: plannedMinutes,
    actual_minutes: actualMinutes,
    tasks,
    schedule_items: scheduleItems.filter((item) => dateOnly(item.start_time) >= startDate),
    daily_logs: dailyLogs.filter((log) => dateOnly(log.log_date || log.created_at) >= startDate),
    daily_checkins: dailyLogs.filter((log) => dateOnly(log.log_date || log.created_at) >= startDate),
    task_feedback: feedback.filter((item) => dateOnly(item.created_at) >= startDate),
    daily_evaluations: dailyEvaluations.filter((evaluation) => dateOnly(evaluation.evaluation_date) >= startDate)
  };
}

export async function createDailyLog(input) {
  validateDailyCheckin(input);

  const record = {
    checkin_id: input.checkin_id || input.log_id || createId('checkin'),
    user_id: input.user_id || 'user_demo',
    checkin_date: input.checkin_date || input.log_date || new Date().toISOString().slice(0, 10),
    mood_level: parseInteger(input.mood_level, 3),
    energy_level: parseInteger(input.energy_level, 3),
    stress_level: parseInteger(input.stress_level, 3),
    sleep_hours: Number.parseFloat(input.sleep_hours),
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
  const task = await buildTaskRecord(input);
  return store.insertTask(task);
}

export async function updateTask(taskId, input) {
  const existing = await store.getTask(taskId);
  if (!existing) throw createHttpError(404, 'Task not found.');
  assertWritableDay(dateOnly(existing.task_date || existing.fixed_date || existing.created_at));

  const updates = buildTaskUpdates(input, existing);
  if (updates.is_fixed_time) {
    validateFixedTask({ ...existing, ...updates });
    const fixedTasks = await store.listFixedTasks(existing.user_id, updates.fixed_date || existing.fixed_date);
    const conflict = findFixedConflict(fixedTasks.filter((task) => task.task_id !== taskId), { ...existing, ...updates });
    if (conflict) throw createHttpError(409, `This fixed-time task overlaps with "${conflict.title}".`);
  }

  const updated = await store.updateTask(taskId, updates);

  if (input.schedule_item_id) {
    await store.updateScheduleItem(input.schedule_item_id, {
      title: updates.title || existing.title,
      category: updates.category || existing.category,
      priority_level: updates.priority_level || existing.priority_level,
      difficulty_level: updates.difficulty_level || existing.difficulty_level,
      start_time: input.start_time || undefined,
      end_time: input.end_time || undefined
    });
  }

  return updated;
}

export async function removeTask(taskId) {
  const task = await store.getTask(taskId);
  if (!task) throw createHttpError(404, 'Task not found.');
  assertWritableDay(dateOnly(task.task_date || task.fixed_date || task.created_at));

  return store.updateTask(taskId, {
    status: 'removed',
    is_completed: false,
    removed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

export async function generateSchedule(input) {
  const userId = input.user_id || 'user_demo';
  const context = await loadScheduleContext(userId, input.daily_log_id || input.checkin_id, input.schedule_date);

  if (!context.dailyLog) {
    throw createHttpError(400, 'Please save a daily check-in before generating the schedule.');
  }

  const dayTasks = context.tasks.filter((task) => shouldTaskBeAvailableForSchedule(task, context.dailyLog.log_date));
  if (dayTasks.length === 0) {
    throw createHttpError(400, 'Add at least one task before generating the schedule.');
  }

  const draft = generateDailySchedule({
    userId,
    dailyLog: context.dailyLog,
    preferences: normalizePreferencesForScheduler(context.preferences),
    tasks: context.tasks,
    feedback: context.feedback,
    scheduleDate: context.dailyLog.log_date
  });

  return saveSchedule(userId, context.dailyLog.log_id, draft, 'active');
}

export async function submitFeedback(input) {
  const sourceItem = input.schedule_item_id ? await store.getScheduleItem(input.schedule_item_id) : null;
  if (sourceItem) assertWritableDay(dateOnly(sourceItem.start_time));

  const outcome = input.outcome || (input.completed ? 'completed' : 'still_in_progress');
  const feedback = {
    feedback_id: createId('feedback'),
    user_id: input.user_id || 'user_demo',
    task_id: input.task_id,
    schedule_item_id: input.schedule_item_id || null,
    outcome,
    completed: outcome === 'completed' || Boolean(input.completed),
    actual_duration_minutes: parseOptionalInteger(input.actual_duration_minutes),
    difficulty_feedback: parseOptionalInteger(input.difficulty_feedback),
    energy_after: parseOptionalInteger(input.energy_after),
    mood_after: parseOptionalInteger(input.mood_after),
    comment: input.comment || '',
    created_at: new Date().toISOString()
  };

  if (!feedback.task_id) throw createHttpError(400, 'task_id is required.');

  await store.insertFeedback(feedback);
  await updateTaskAndItemFromFeedback(feedback);

  const date = sourceItem ? dateOnly(sourceItem.start_time) : null;
  const evaluation = date ? await saveDailyEvaluationForDate(feedback.user_id, date) : null;
  const reschedule = outcome === 'completed' ? null : await rescheduleAfterFeedback(feedback);

  return {
    feedback,
    daily_evaluation: evaluation,
    updated_schedule: reschedule?.schedule || null,
    updated_items: reschedule?.items || []
  };
}

export async function updateScheduleItemStatus(scheduleItemId, input) {
  const item = await store.getScheduleItem(scheduleItemId);
  if (!item) throw createHttpError(404, 'Schedule item not found.');
  const schedule = await store.getSchedule(item.schedule_id);
  if (!schedule) throw createHttpError(404, 'Schedule not found.');
  const dayKey = dateOnly(item.start_time);
  assertWritableDay(dayKey);

  const status = normalizeScheduleItemStatus(input.status);
  if (status === 'in_progress' && item.task_kind === 'fixed' && !input.automatic) {
    throw createHttpError(400, 'Fixed-time tasks start automatically.');
  }

  const updates = buildScheduleItemStatusUpdates(item, status, input);

  if (status === 'in_progress') {
    const dayItems = await store.listScheduleItemsForDate(schedule.user_id, dayKey);
    await Promise.all(dayItems
      .filter((dayItem) => dayItem.status === 'in_progress' && dayItem.schedule_item_id !== scheduleItemId)
      .map((dayItem) => store.updateScheduleItem(dayItem.schedule_item_id, { status: 'waiting' })));
  }

  const updatedItem = await store.updateScheduleItem(scheduleItemId, updates);
  await updateTaskForScheduleStatus(updatedItem, status, dayKey);
  const evaluation = await saveDailyEvaluationForDate(schedule.user_id, dayKey);
  const items = await store.listScheduleItemsForDate(schedule.user_id, dayKey);

  return { item: updatedItem, items, daily_evaluation: evaluation };
}

export async function updateSubtask(subtaskId, input) {
  const subtask = await store.getSubtask(subtaskId);
  if (!subtask) throw createHttpError(404, 'Subtask not found.');
  const item = subtask.schedule_item_id ? await store.getScheduleItem(subtask.schedule_item_id) : null;
  if (item) assertWritableDay(dateOnly(item.start_time));

  return store.updateSubtask(subtaskId, {
    is_completed: Boolean(input.is_completed),
    updated_at: new Date().toISOString()
  });
}

export async function addTaskResource(input) {
  const item = input.schedule_item_id ? await store.getScheduleItem(input.schedule_item_id) : null;
  if (item) assertWritableDay(dateOnly(item.start_time));

  const record = {
    resource_id: createId('resource'),
    user_id: input.user_id || 'user_demo',
    task_id: input.task_id,
    schedule_item_id: input.schedule_item_id || null,
    resource_type: input.resource_type || input.type,
    label: input.label || '',
    value: input.value,
    preview_url: input.preview_url || input.preview || null,
    created_at: new Date().toISOString()
  };

  if (!record.task_id) throw createHttpError(400, 'task_id is required.');
  if (!record.resource_type || !record.value) throw createHttpError(400, 'Resource type and value are required.');

  return store.insertResource(record);
}

export async function deleteTaskResource(resourceId) {
  return store.deleteResource(resourceId);
}

export async function saveUserPreferences(userId, input) {
  const settings = input.settings || null;
  const preference = {
    preference_id: input.preference_id || createId('pref'),
    user_id: userId,
    wake_up_time: input.wake_up_time || settings?.schedule?.wake_up_time || '07:00',
    sleep_time: input.sleep_time || settings?.schedule?.sleep_time || '22:30',
    preferred_start_time: input.preferred_start_time || settings?.schedule?.work_start || settings?.schedule?.planning_start || '09:00',
    preferred_end_time: input.preferred_end_time || settings?.schedule?.work_end || settings?.schedule?.planning_end || '18:00',
    break_duration_minutes: parseInteger(input.break_duration_minutes || settings?.schedule?.break_duration, 10),
    focus_session_minutes: parseInteger(input.focus_session_minutes || settings?.schedule?.focus_length, 60),
    language: input.language || settings?.system?.language || 'English',
    theme: input.theme || settings?.appearance?.theme || 'Blue / Teal',
    ai_recommendations_enabled: Boolean(input.ai_recommendations_enabled ?? settings?.ai?.recommendations ?? true),
    notifications_enabled: Boolean(input.notifications_enabled ?? settings?.notifications?.task_reminders ?? true),
    settings_json: settings ? JSON.stringify(settings) : null,
    updated_at: new Date().toISOString()
  };

  return store.upsertUserPreferences(preference);
}

async function loadScheduleContext(userId, dailyLogId, scheduleDate) {
  const [preferences, dailyLogs, tasks, feedback] = await Promise.all([
    store.getUserPreferences(userId),
    store.listDailyLogs(userId),
    store.listTasks(userId),
    store.listFeedback(userId)
  ]);

  const dailyLog = dailyLogId
    ? dailyLogs.find((item) => item.log_id === dailyLogId || item.checkin_id === dailyLogId)
    : dailyLogs.find((item) => dateOnly(item.log_date) === scheduleDate) || latestRecord(dailyLogs);

  return { preferences, dailyLog, tasks, feedback };
}

async function updateTaskAndItemFromFeedback(feedback) {
  const task = await store.getTask(feedback.task_id);
  if (!task) return;

  const currentRemaining = parseInteger(task.remaining_duration_minutes, task.estimated_duration_minutes || 0);
  const actualDuration = feedback.actual_duration_minutes || 0;
  const updates = { updated_at: new Date().toISOString() };
  const itemUpdates = {};

  if (feedback.outcome === 'completed') {
    Object.assign(updates, {
      is_completed: true,
      status: 'completed',
      remaining_duration_minutes: 0,
      actual_duration_minutes: actualDuration || task.actual_duration_minutes,
      completed_on: todayKey(),
      completed_at: new Date().toISOString()
    });
    Object.assign(itemUpdates, {
      status: 'completed',
      completed_at: updates.completed_at,
      actual_duration_minutes: actualDuration || undefined
    });
  } else if (feedback.outcome === 'return_to_waiting' || feedback.outcome === 'waiting') {
    Object.assign(updates, {
      is_completed: false,
      status: 'pending',
      remaining_duration_minutes: Math.max(15, currentRemaining - actualDuration || Math.ceil(currentRemaining * 0.5)),
      completed_on: null,
      completed_at: null
    });
    Object.assign(itemUpdates, { status: 'waiting' });
  } else {
    Object.assign(updates, {
      is_completed: false,
      status: 'in_progress',
      remaining_duration_minutes: Math.max(15, currentRemaining - actualDuration || currentRemaining),
      completed_on: null,
      completed_at: null
    });
    Object.assign(itemUpdates, { status: 'in_progress' });
  }

  if (feedback.difficulty_feedback) {
    updates.difficulty_level = Math.max(task.difficulty_level || 1, feedback.difficulty_feedback);
  }

  await store.updateTask(task.task_id, updates);
  if (feedback.schedule_item_id) {
    await store.updateScheduleItem(feedback.schedule_item_id, itemUpdates);
  }
}

async function updateTaskForScheduleStatus(item, status, dayKey) {
  const updates = { updated_at: new Date().toISOString() };
  if (status === 'completed') {
    Object.assign(updates, {
      status: 'completed',
      is_completed: true,
      completed_on: dayKey,
      completed_at: item.completed_at || new Date().toISOString(),
      actual_duration_minutes: item.actual_duration_minutes || null,
      remaining_duration_minutes: 0
    });
  } else if (status === 'removed') {
    Object.assign(updates, {
      status: 'removed',
      is_completed: false,
      removed_at: new Date().toISOString()
    });
  } else if (status === 'in_progress') {
    Object.assign(updates, {
      status: 'in_progress',
      is_completed: false,
      completed_on: null,
      completed_at: null
    });
  } else {
    Object.assign(updates, {
      status: 'pending',
      is_completed: false,
      completed_on: null,
      completed_at: null
    });
  }
  await store.updateTask(item.task_id, updates);
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
    preferences: normalizePreferencesForScheduler(preferences),
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
    task_id: item.task_id,
    title: item.title,
    category: item.category || null,
    difficulty_level: item.difficulty_level || null,
    priority_level: item.priority_level || null,
    start_time: item.start_time,
    end_time: item.end_time,
    energy_slot: item.energy_slot,
    task_kind: item.task_kind,
    reason: item.reason,
    status: 'waiting',
    created_at: new Date().toISOString()
  }));

  const saved = await store.insertScheduleWithItems(schedule, items);
  await saveScheduleNotes(userId, saved.schedule, draft);
  await saveDailyEvaluationForDate(userId, draft.schedule_date);
  return saved;
}

async function saveScheduleNotes(userId, schedule, draft) {
  const notes = [
    {
      note_type: 'recommendation',
      title: 'Daily schedule advice',
      message: draft.schedule_note,
      source: 'rule_based'
    }
  ];

  if (draft.items.length === 0) {
    notes.push({
      note_type: 'time_management',
      title: 'No available task blocks',
      message: 'No schedule blocks could be generated. Check your planning window and task durations.',
      source: 'rule_based'
    });
  }

  await Promise.all(notes.map((note) => store.insertAiNote({
    note_id: createId('note'),
    user_id: userId,
    note_date: draft.schedule_date,
    schedule_id: schedule.schedule_id,
    related_task_id: null,
    ...note,
    created_at: new Date().toISOString()
  })));
}

async function saveDailyEvaluationForDate(userId, date) {
  const [items, dailyLogs, schedules] = await Promise.all([
    store.listScheduleItemsForDate(userId, date),
    store.listDailyLogs(userId),
    store.listSchedules(userId)
  ]);
  const dayLog = dailyLogs.find((log) => dateOnly(log.log_date) === date);
  const schedule = latestRecord(schedules.filter((item) => dateOnly(item.schedule_date) === date), 'generated_at');
  const activeItems = items.filter((item) => item.status !== 'removed');
  const completedItems = activeItems.filter((item) => item.status === 'completed');
  const totalTasks = activeItems.length;
  const completedTasks = completedItems.length;
  const unfinishedTasks = Math.max(0, totalTasks - completedTasks);
  const completionPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const plannedMinutes = activeItems.reduce((sum, item) => sum + getDurationMinutes(item.start_time, item.end_time), 0);
  const actualMinutes = completedItems.reduce((sum, item) => {
    const actual = parseOptionalInteger(item.actual_duration_minutes);
    return sum + (actual || getDurationMinutes(item.started_at || item.start_time, item.completed_at || item.end_time));
  }, 0);
  const timeScore = plannedMinutes
    ? clampScore(Math.round(100 - Math.min(65, Math.abs(actualMinutes - plannedMinutes) / plannedMinutes * 100)))
    : 50;
  const productivityScore = clampScore(Math.round(completionPercentage * 0.75 + timeScore * 0.25));

  return store.upsertDailyEvaluation({
    evaluation_id: createId('eval'),
    user_id: userId,
    schedule_id: schedule?.schedule_id || null,
    evaluation_date: date,
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    unfinished_tasks: unfinishedTasks,
    completion_percentage: completionPercentage,
    productivity_score: productivityScore,
    planned_minutes: plannedMinutes,
    actual_minutes: actualMinutes,
    average_mood: dayLog?.mood_level || null,
    average_energy: dayLog?.energy_level || null,
    average_stress: dayLog?.stress_level || null,
    message: getDailyEvaluationMessage(productivityScore),
    updated_at: new Date().toISOString()
  });
}

async function autoTransitionFixedTasks(userId, date) {
  const items = await store.listScheduleItemsForDate(userId, date);
  const now = new Date();
  const fixedItems = items.filter((item) => item.task_kind === 'fixed' && item.status !== 'removed');
  for (const item of fixedItems) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (!isValidDate(start) || !isValidDate(end)) continue;
    if (now >= end && item.status !== 'completed') {
      await updateScheduleItemStatus(item.schedule_item_id, {
        status: 'completed',
        automatic: true,
        completed_at: now.toISOString(),
        actual_duration_minutes: getDurationMinutes(item.started_at || item.start_time, now.toISOString())
      });
      continue;
    }
    if (now >= start && now < end && item.status !== 'in_progress') {
      await updateScheduleItemStatus(item.schedule_item_id, {
        status: 'in_progress',
        automatic: true,
        started_at: now.toISOString()
      });
    }
  }
}

async function buildTaskRecord(input) {
  const enriched = categorizeTask(input);
  const isFixed = Boolean(input.is_fixed_time || input.task_type === 'fixed');
  const task = {
    task_id: createId('task'),
    user_id: input.user_id || 'user_demo',
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    ...enriched,
    priority_level: parseInteger(input.priority_level, 3),
    remaining_duration_minutes: enriched.estimated_duration_minutes,
    task_type: isFixed ? 'fixed' : 'flexible',
    task_date: input.task_date || deriveTaskDate({ ...input, is_fixed_time: isFixed }),
    deadline: normalizeDateTimeInput(input.deadline),
    status: 'pending',
    is_completed: false,
    is_fixed_time: isFixed,
    fixed_date: isFixed ? input.fixed_date || input.task_date || null : null,
    fixed_start_time: isFixed ? input.fixed_start_time || null : null,
    fixed_end_time: isFixed ? input.fixed_end_time || null : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  validateTask(task);

  if (task.is_fixed_time) {
    validateFixedTask(task);
    const fixedTasks = await store.listFixedTasks(task.user_id, task.fixed_date);
    const conflict = findFixedConflict(fixedTasks, task);
    if (conflict) throw createHttpError(409, `This fixed-time task overlaps with "${conflict.title}".`);
  }

  return task;
}

function buildTaskUpdates(input, existing) {
  const merged = { ...existing, ...input };
  const enriched = categorizeTask(merged);
  const isFixed = Boolean(input.is_fixed_time ?? existing.is_fixed_time);
  const updates = {
    title: input.title?.trim(),
    description: input.description,
    category: input.category || enriched.category,
    priority_level: input.priority_level ? parseInteger(input.priority_level, existing.priority_level) : undefined,
    difficulty_level: input.difficulty_level ? parseInteger(input.difficulty_level, existing.difficulty_level) : undefined,
    estimated_duration_minutes: input.estimated_duration_minutes
      ? parseInteger(input.estimated_duration_minutes, existing.estimated_duration_minutes)
      : undefined,
    remaining_duration_minutes: input.remaining_duration_minutes !== undefined
      ? parseInteger(input.remaining_duration_minutes, existing.remaining_duration_minutes)
      : input.estimated_duration_minutes
      ? parseInteger(input.estimated_duration_minutes, existing.estimated_duration_minutes)
      : undefined,
    task_type: isFixed ? 'fixed' : 'flexible',
    task_date: input.task_date,
    deadline: input.deadline !== undefined ? normalizeDateTimeInput(input.deadline) : undefined,
    is_fixed_time: isFixed,
    fixed_date: isFixed ? input.fixed_date || existing.fixed_date || input.task_date : null,
    fixed_start_time: isFixed ? input.fixed_start_time || existing.fixed_start_time : null,
    fixed_end_time: isFixed ? input.fixed_end_time || existing.fixed_end_time : null,
    status: input.status,
    is_completed: input.is_completed,
    completed_on: input.completed_on,
    completed_at: input.completed_at,
    actual_duration_minutes: input.actual_duration_minutes,
    removed_at: input.removed_at,
    updated_at: new Date().toISOString()
  };

  return cleanUndefined(updates);
}

function buildScheduleItemStatusUpdates(item, status, input) {
  const now = new Date().toISOString();
  if (status === 'in_progress') {
    return {
      status,
      started_at: input.started_at || item.started_at || now,
      restored_at: input.restored_at || item.restored_at || null
    };
  }
  if (status === 'completed') {
    return {
      status,
      completed_at: input.completed_at || now,
      actual_duration_minutes: parseOptionalInteger(input.actual_duration_minutes) || getDurationMinutes(item.started_at || item.start_time, input.completed_at || now)
    };
  }
  if (status === 'removed') {
    return {
      status,
      removed_at: now
    };
  }
  return {
    status: 'waiting',
    restored_at: input.restored_at || item.restored_at || null
  };
}

function validateDailyCheckin(input) {
  for (const field of ['mood_level', 'energy_level', 'sleep_hours', 'stress_level']) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw createHttpError(400, `${field} is required.`);
    }
  }
}

function validateTask(task) {
  if (!task.title) throw createHttpError(400, 'Task title is required.');
  if (!task.estimated_duration_minutes || task.estimated_duration_minutes < 1) {
    throw createHttpError(400, 'Estimated duration is required.');
  }
  if (!task.priority_level) throw createHttpError(400, 'Priority level is required.');
  if (!task.difficulty_level) throw createHttpError(400, 'Difficulty level is required.');
  if (!task.task_type) throw createHttpError(400, 'Task type is required.');
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
  const newStart = `${newTask.fixed_date}T${String(newTask.fixed_start_time).slice(0, 5)}:00`;
  const newEnd = `${newTask.fixed_date}T${String(newTask.fixed_end_time).slice(0, 5)}:00`;

  return existingTasks.find((task) => {
    if (dateOnly(task.fixed_date) !== dateOnly(newTask.fixed_date)) return false;
    const currentStart = `${dateOnly(task.fixed_date)}T${String(task.fixed_start_time).slice(0, 5)}:00`;
    const currentEnd = `${dateOnly(task.fixed_date)}T${String(task.fixed_end_time).slice(0, 5)}:00`;
    return newStart < currentEnd && newEnd > currentStart;
  });
}

function deriveTaskDate(input) {
  if (input.is_fixed_time && input.fixed_date) return input.fixed_date;
  return input.task_date || new Date().toISOString().slice(0, 10);
}

function shouldTaskBeAvailableForSchedule(task, targetDate) {
  if (task.status === 'removed' || task.status === 'deleted' || task.is_completed) return false;
  if (task.is_fixed_time) return dateOnly(task.fixed_date) === targetDate;
  const startDate = dateOnly(task.task_date) || dateOnly(task.created_at);
  if (startDate && targetDate < startDate) return false;
  return !task.deadline || targetDate <= dateOnly(task.deadline) || targetDate >= startDate;
}

function isTaskVisibleOnDate(task, targetDate) {
  if (!task || ['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase())) return false;
  if (task.is_fixed_time) return dateOnly(task.fixed_date) === targetDate;

  const completedDate = dateOnly(task.completed_on || task.completed_at);
  if (completedDate) return completedDate === targetDate;

  const startDate = dateOnly(task.task_date || task.created_at);
  const deadlineDate = dateOnly(task.deadline);
  if (startDate && targetDate < startDate) return false;
  if (deadlineDate && targetDate <= deadlineDate) return true;
  return startDate === targetDate;
}

function normalizePreferencesForScheduler(preferences) {
  if (!preferences) return null;
  return {
    ...preferences,
    preferred_study_start: preferences.preferred_start_time,
    preferred_study_end: preferences.preferred_end_time
  };
}

function buildDefaultPreferences(userId) {
  return {
    preference_id: createId('pref'),
    user_id: userId,
    wake_up_time: '07:00',
    sleep_time: '22:30',
    preferred_start_time: '09:00',
    preferred_end_time: '18:00',
    break_duration_minutes: 10,
    focus_session_minutes: 60,
    language: 'English',
    theme: 'Blue / Teal',
    ai_recommendations_enabled: true,
    notifications_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function buildAuthPayload(user, preferences) {
  return {
    user: stripSensitiveUser(user),
    preferences,
    user_id: user.user_id
  };
}

function stripSensitiveUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
  return `scrypt:${salt}:${hash}`;
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  if (passwordHash.startsWith('dev:')) {
    return password === passwordHash.slice(4);
  }
  const [scheme, salt, hash] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const testHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

function normalizeScheduleItemStatus(status) {
  const value = String(status || '').trim();
  if (['waiting', 'in_progress', 'completed', 'removed'].includes(value)) return value;
  throw createHttpError(400, 'Unsupported schedule item status.');
}

function assertWritableDay(dayKey) {
  if (dayKey && dayKey < todayKey()) {
    throw createHttpError(403, 'Past days are review-only.');
  }
}

function getWeekDayKeys(dateValue) {
  const base = new Date(`${dateOnly(dateValue) || todayKey()}T00:00:00`);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dateOnly(date);
  });
}

function getPeriodStartKey(period) {
  const now = new Date();
  if (period === 'daily') return dateOnly(now);
  if (period === 'monthly') return dateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return dateOnly(start);
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

function cleanUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function normalizeDateTimeInput(value) {
  if (!value) return null;
  return String(value).length === 16 ? `${value}:00` : value;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return formatDateKey(value);
  return String(value).slice(0, 10);
}

function todayKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function getDurationMinutes(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) return 0;
  return Math.max(1, Math.round((endDate - startDate) / 60000));
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

function getDailyEvaluationMessage(score) {
  if (score >= 90) return 'Excellent day. You completed almost everything and managed your time very well.';
  if (score >= 70) return 'Good progress. You completed many tasks and stayed mostly on track.';
  if (score >= 50) return 'Moderate day. You completed some tasks, but there is room for better planning.';
  return 'Challenging day. Try using shorter tasks and more breaks tomorrow.';
}
