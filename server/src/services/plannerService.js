import crypto from 'node:crypto';
import { categorizeTask } from '../logic/ai.js';
import { generateDailySchedule } from '../logic/scheduler.js';
import {
  groupScheduleItemsByTask,
  reconcileScheduleItemsForDate
} from '../logic/scheduleDedup.js';
import { createId } from '../utils/id.js';
import { createHttpError } from '../utils/httpError.js';
import { getStore } from '../data/store.js';
import {
  analyzeMoodWithAi,
  classifyTaskWithAi,
  estimateTimeWithAi,
  generateAdviceWithAi,
  generateScheduleHintsWithAi,
  generateSubtasksWithAi,
  getAiServiceHealth
} from './aiClient.js';
import {
  buildSubtaskPredictionInput,
  buildSubtaskPredictionOutput,
  isValidatedOpenAiSubtaskResult,
  normalizeSubtaskProvenance,
  safeSubtaskPredictionModel
} from './subtaskGenerationPolicy.js';
import {
  buildAdviceGenerationRequest,
  buildAdviceCacheIdentity,
  buildAdvicePredictionInput,
  buildAdvicePredictionOutput,
  buildAdviceSingleFlightKey,
  createAdviceSingleFlight,
  getCachedAdviceResult,
  isGenerativeAdviceEnabled,
  isValidatedOpenAiAdviceResult,
  LEGACY_AI_NOTE_SOURCE,
  normalizeAdviceProvenance
} from './adviceGenerationPolicy.js';

const store = await getStore();
const runAdviceSingleFlight = createAdviceSingleFlight();

export async function getHealth() {
  const database = await store.healthCheck();
  const aiService = await getAiServiceHealth();
  return {
    status: database.connected ? 'ok' : 'error',
    server: 'ok',
    database,
    ai_service: aiService
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

  const completedHistoryRequest = typeof store.listCompletedScheduleItemsForDate === 'function'
    ? store.listCompletedScheduleItemsForDate(userId, date)
    : Promise.resolve([]);
  const [schedule, currentItems, completedHistory, tasks, dailyLogs, feedback, dailyEvaluations] = await Promise.all([
    store.getScheduleByDate(userId, date),
    store.listScheduleItemsForDate(userId, date),
    completedHistoryRequest,
    store.listTasks(userId),
    store.listDailyLogs(userId),
    store.listFeedback(userId),
    store.listDailyEvaluations(userId)
  ]);

  const displayItems = filterScheduleItemsForDisplayDate(currentItems, tasks, date, completedHistory);
  const displayTaskIds = new Set(displayItems.map((item) => item.task_id).filter(Boolean));
  const currentDayTasks = tasks.filter((task) => isTaskAssignedOrCompletedOnDate(task, date) || displayTaskIds.has(task.task_id));
  const previousUnfinishedTasks = getPreviousUnfinishedTasks(tasks, date);
  const dailyCheckin = dailyLogs.find((log) => dateOnly(log.log_date) === date) || null;
  const dayFeedback = feedback.filter((item) => !item.schedule_item_id || displayItems.some((scheduleItem) => scheduleItem.schedule_item_id === item.schedule_item_id));
  const dailyEvaluation = dailyEvaluations.find((evaluation) => dateOnly(evaluation.evaluation_date) === date) || null;
  await ensureAdviceNotes(buildDailyAdviceContext({
    userId,
    date,
    schedule,
    items: displayItems,
    tasks: currentDayTasks,
    dailyCheckin,
    feedback: dayFeedback,
    dailyEvaluation
  }));
  const latestAiNotes = await store.listAiNotes(userId);

  return {
    schedule,
    items: displayItems,
    schedule_items: displayItems,
    tasks: currentDayTasks,
    unfinished_tasks: previousUnfinishedTasks,
    previous_unfinished_tasks: previousUnfinishedTasks,
    daily_checkin: dailyCheckin,
    task_feedback: dayFeedback,
    ai_notes: selectLatestDailyAdviceNotes(filterAdviceNotesForCheckin(
      latestAiNotes.filter((note) => dateOnly(note.note_date || note.created_at) === date),
      dailyCheckin
    )),
    daily_evaluation: dailyEvaluation
  };
}

export async function getDayData(userId, date) {
  if (!date) throw createHttpError(400, 'date is required.');
  const completedHistoryRequest = typeof store.listCompletedScheduleItemsForDate === 'function'
    ? store.listCompletedScheduleItemsForDate(userId, date)
    : Promise.resolve([]);
  const [tasks, dailyLogs, schedule, currentItems, completedHistory, aiNotes, dailyEvaluations] = await Promise.all([
    store.listTasks(userId),
    store.listDailyLogs(userId),
    store.getScheduleByDate(userId, date),
    store.listScheduleItemsForDate(userId, date),
    completedHistoryRequest,
    store.listAiNotes(userId),
    store.listDailyEvaluations(userId)
  ]);
  const displayItems = filterScheduleItemsForDisplayDate(currentItems, tasks, date, completedHistory);
  const displayTaskIds = new Set(displayItems.map((item) => item.task_id).filter(Boolean));
  const currentDayTasks = tasks.filter((task) => isTaskAssignedOrCompletedOnDate(task, date) || displayTaskIds.has(task.task_id));
  const previousUnfinishedTasks = getPreviousUnfinishedTasks(tasks, date);
  return {
    date,
    daily_checkin: dailyLogs.find((log) => dateOnly(log.log_date) === date) || null,
    daily_log: dailyLogs.find((log) => dateOnly(log.log_date) === date) || null,
    tasks: currentDayTasks,
    unfinished_tasks: previousUnfinishedTasks,
    previous_unfinished_tasks: previousUnfinishedTasks,
    schedule,
    schedule_items: displayItems,
    items: displayItems,
    ai_notes: selectLatestDailyAdviceNotes(filterAdviceNotesForCheckin(
      aiNotes.filter((note) => dateOnly(note.note_date || note.created_at) === date),
      dailyLogs.find((log) => dateOnly(log.log_date) === date) || null
    )),
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
    const completed = dayTasks.filter(isTaskComplete).length;
    const evaluation = evaluationByDate.get(dayKey);
    const completionPercentage = getCompletionPercentage(completed, dayTasks.length);
    return {
      date: dayKey,
      total_tasks: dayTasks.length,
      completed_tasks: completed,
      completion_percentage: completionPercentage,
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
      !isTaskComplete(task) &&
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
    const completed = dayTasks.filter(isTaskComplete).length;
    const evaluation = dailyEvaluations.find((item) => dateOnly(item.evaluation_date) === key);
    const checkin = dailyLogs.find((item) => dateOnly(item.log_date) === key);
    const completionPercentage = getCompletionPercentage(completed, dayTasks.length);
    days.push({
      date: key,
      task_count: dayTasks.length,
      deadline_count: dayTasks.filter((task) => task.deadline && !task.is_completed).length,
      completion_percentage: completionPercentage,
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
  const [dailyLogs, feedback, dailyEvaluations, tasks, scheduleItems] = await Promise.all([
    store.listDailyLogs(userId),
    store.listFeedback(userId),
    store.listDailyEvaluations(userId),
    store.listTasks(userId),
    store.listAllScheduleItems(userId)
  ]);
  await ensureAdviceNotes(buildPeriodAdviceContext({
    userId,
    period,
    startDate,
    dailyLogs,
    feedback,
    dailyEvaluations,
    tasks,
    scheduleItems
  }));
  const aiNotes = await store.listAiNotes(userId);
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
  const filteredTasks = tasks.filter((task) => (dateOnly(task.completed_date || task.completed_on || task.completed_at || task.task_date || task.created_at) || todayKey()) >= startDate);
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

export async function analyzeMoodRequest(input) {
  const analysis = await analyzeMoodWithAi(input);
  if (input.user_id) {
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: input.user_id,
      module_name: 'mood_analysis',
      model_name: analysis.model || null,
      source: analysis.source || 'python_ai_service',
      confidence: analysis.confidence ?? null,
      input_json: input,
      output_json: analysis,
      created_at: new Date().toISOString()
    });
  }
  return { analysis };
}

export async function classifyTaskRequest(input) {
  const classification = await classifyTaskWithAi(input);
  if (input.user_id) {
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: input.user_id,
      module_name: 'task_classification',
      model_name: classification.model || null,
      source: classification.source || 'python_ai_service',
      confidence: classification.confidence ?? null,
      input_json: input,
      output_json: classification,
      created_at: new Date().toISOString()
    });
  }
  return { classification };
}

export async function estimateTimeRequest(input) {
  const estimation = await estimateTimeWithAi(input);
  if (input.user_id) {
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: input.user_id,
      module_name: 'time_estimation',
      model_name: estimation.model || null,
      source: estimation.source || 'python_ai_service',
      confidence: estimation.confidence ?? null,
      input_json: input,
      output_json: estimation,
      created_at: new Date().toISOString()
    });
  }
  return { estimation };
}

export async function generateScheduleHintsRequest(input) {
  const hints = await generateScheduleHintsWithAi(input);
  if (input.user_id) {
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: input.user_id,
      module_name: 'scheduler_hints',
      model_name: hints.model || null,
      source: hints.source || 'python_ai_service',
      confidence: hints.confidence ?? null,
      input_json: input,
      output_json: hints,
      created_at: new Date().toISOString()
    });
  }
  return { hints };
}

export async function generateSubtasksRequest(input) {
  const result = await generateSubtasksWithAi(input);
  if (input.user_id) {
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: input.user_id,
      related_task_id: input.task_id || null,
      module_name: 'subtask_generation',
      model_name: safeSubtaskPredictionModel(result),
      source: normalizeSubtaskProvenance(result),
      confidence: result.confidence ?? null,
      input_json: buildSubtaskPredictionInput(input, result),
      output_json: buildSubtaskPredictionOutput(result),
      created_at: new Date().toISOString()
    });
  }
  return result;
}

export async function generateAdviceRequest(input) {
  const execution = await generateAdviceForContext(input);
  if (!execution.cached && input.user_id) {
    await persistAdviceRecordsSafely(input, execution.request, execution.result, []);
  }
  return execution.result;
}

export async function createDailyLog(input) {
  validateDailyCheckin(input);
  const moodAnalysis = await analyzeMoodWithAi(input);

  const record = {
    checkin_id: input.checkin_id || input.log_id || createId('checkin'),
    user_id: input.user_id || 'user_demo',
    checkin_date: input.checkin_date || input.log_date || new Date().toISOString().slice(0, 10),
    mood_level: parseInteger(input.mood_level, 3),
    energy_level: parseInteger(input.energy_level, 3),
    stress_level: parseInteger(input.stress_level, 3),
    sleep_hours: Number.parseFloat(input.sleep_hours),
    is_tired: parseBoolean(input.is_tired),
    planning_start: input.planning_start || null,
    planning_end: input.planning_end || null,
    mood_text_original: input.mood_text_original || '',
    detected_language: moodAnalysis.detected_language,
    mood_text_translated: moodAnalysis.mood_text_translated ?? input.mood_text_original ?? '',
    detected_emotion: moodAnalysis.detected_emotion || moodAnalysis.predicted_mood,
    predicted_energy_level: parseInteger(moodAnalysis.predicted_energy_level, parseInteger(input.energy_level, 3)),
    ai_advice: moodAnalysis.ai_advice || moodAnalysis.energy_insights || '',
    created_at: new Date().toISOString()
  };

  const saved = await store.insertDailyLog(record);
  await persistMoodAiOutputs(saved, input, moodAnalysis);
  return saved;
}

export async function createTask(input) {
  const { task, aiOutputs } = await buildTaskRecord(input);
  const saved = await store.insertTask(task);
  await persistTaskAiOutputs(saved, input, aiOutputs);
  return saved;
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

export async function moveTaskToDate(taskId, input = {}) {
  const userId = input.user_id || 'user_demo';
  const targetDate = dateOnly(input.date || input.assigned_date || input.schedule_date || input.task_date);
  if (!targetDate) throw createHttpError(400, 'date is required.');
  assertWritableDay(targetDate);

  const task = await store.getTask(taskId);
  if (!task || task.user_id !== userId) throw createHttpError(404, 'Task not found.');
  if (isTaskComplete(task)) throw createHttpError(400, 'Completed tasks stay on their completion day and cannot be moved.');
  if (task.is_fixed_time) throw createHttpError(400, 'Fixed-time tasks must be edited with a new fixed date instead of moved.');
  if (['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase())) {
    throw createHttpError(400, 'Removed tasks cannot be moved to another day.');
  }

  const updated = await store.updateTask(taskId, {
    assigned_date: targetDate,
    schedule_date: targetDate,
    status: task.status === 'in_progress' ? 'pending' : task.status || 'pending',
    updated_at: new Date().toISOString()
  });

  return { task: updated };
}

export async function startTaskOnDate(taskId, input = {}) {
  const userId = input.user_id || 'user_demo';
  const date = dateOnly(input.date || input.schedule_date || todayKey());
  assertWritableDay(date);

  const task = await store.getTask(taskId);
  if (!task || task.user_id !== userId) throw createHttpError(404, 'Task not found.');
  if (isBreakScheduleItem(task)) throw createHttpError(400, 'Breaks cannot be started like tasks.');
  if (task.is_fixed_time) throw createHttpError(400, 'Fixed-time tasks start automatically at their scheduled time.');
  if (isTaskComplete(task)) throw createHttpError(400, 'This task is already completed.');
  if (!isTaskAssignedToDate(task, date)) {
    throw createHttpError(400, 'Move this task to the selected day before starting it.');
  }

  const existingItems = await store.listScheduleItemsForDate(userId, date);
  const existingItem = existingItems.find((item) => item.task_id === taskId && item.status !== 'removed');
  if (existingItem) {
    return updateScheduleItemStatus(existingItem.schedule_item_id, {
      status: 'in_progress',
      started_at: input.started_at,
      actual_started_at: input.actual_started_at || input.started_at
    });
  }

  const activeItem = existingItems.find((item) => item.status === 'in_progress' && !isBreakScheduleItem(item));
  if (activeItem) {
    throw createHttpError(409, 'Finish or return the current task before starting another one.');
  }

  const startedAt = normalizeDateTimeInput(input.actual_started_at || input.started_at) || new Date().toISOString();
  const plannedStart = buildScheduleTimeOnDate(date, startedAt);
  const durationMinutes = Math.max(15, parseInteger(task.remaining_duration_minutes || task.estimated_duration_minutes, 30));
  const plannedEnd = addMinutes(plannedStart, durationMinutes).toISOString();
  const dailyLogs = await store.listDailyLogs(userId);
  const dailyLog = dailyLogs.find((log) => dateOnly(log.log_date || log.checkin_date) === date) || null;

  const draft = {
    schedule_date: date,
    schedule_note: 'Manual schedule block created because the user chose to work on this task on the selected day.',
    items: [{
      task_id: task.task_id,
      title: task.title,
      category: task.category || null,
      difficulty_level: task.difficulty_level || null,
      priority_level: task.priority_level || null,
      start_time: plannedStart,
      end_time: plannedEnd,
      energy_slot: 'manual',
      task_kind: 'flexible',
      reason: 'Started manually on the selected day.'
    }]
  };

  const saved = await saveSchedule(userId, dailyLog?.log_id || null, draft, 'manual');
  const createdItem = saved.items.find((item) => item.task_id === taskId) || saved.items[0];
  return updateScheduleItemStatus(createdItem.schedule_item_id, {
    status: 'in_progress',
    started_at: startedAt,
    actual_started_at: startedAt
  });
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
  assertWritableDay(dateOnly(context.dailyLog.log_date));

  const scheduledTaskIdsForDay = new Set((context.scheduleItems || []).map((item) => item.task_id).filter(Boolean));
  const dayTasks = context.tasks.filter((task) => (
    shouldTaskBeAvailableForSchedule(task, context.dailyLog.log_date) ||
    (!isTaskComplete(task) && scheduledTaskIdsForDay.has(task.task_id))
  ));
  if (dayTasks.length === 0) {
    throw createHttpError(400, 'Add at least one task before generating the schedule.');
  }

  const aiHints = await generateScheduleHintsWithAi({
    user_id: userId,
    daily_checkin: context.dailyLog,
    preferences: context.preferences,
    tasks: dayTasks,
    feedback: context.feedback
  });

  const draft = generateDailySchedule({
    userId,
    dailyLog: context.dailyLog,
    preferences: normalizePreferencesForScheduler(context.preferences),
    tasks: dayTasks,
    feedback: context.feedback,
    scheduleDate: context.dailyLog.log_date
  });

  return saveSchedule(userId, context.dailyLog.log_id, draft, 'active', aiHints);
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
  await updateTaskAndItemFromFeedback(feedback, sourceItem);

  const date = sourceItem ? dateOnly(sourceItem.start_time) : null;
  const evaluation = date ? await saveDailyEvaluationForDate(feedback.user_id, date) : null;
  const reschedule = await rescheduleAfterFeedback(feedback);

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

  if (isBreakScheduleItem(item)) {
    throw createHttpError(400, 'Break items are timeline items and cannot be started, completed, or removed like tasks.');
  }

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
  if (status === 'in_progress') {
    await ensureAiSubtasksForItem(schedule.user_id, updatedItem);
  }
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
  const targetDate = dateOnly(dailyLog?.log_date || scheduleDate);
  const scheduleItems = targetDate ? await store.listScheduleItemsForDate(userId, targetDate) : [];

  return { preferences, dailyLog, tasks, feedback, scheduleItems };
}

async function updateTaskAndItemFromFeedback(feedback, sourceItem = null) {
  const task = await store.getTask(feedback.task_id);
  if (!task) return;

  const currentRemaining = parseInteger(task.remaining_duration_minutes, task.estimated_duration_minutes || 0);
  const completedAt = new Date().toISOString();
  const completionDate = dateOnly(completedAt);
  const actualDuration = feedback.actual_duration_minutes ||
    (sourceItem ? calculateActualDurationFromItem(sourceItem, completedAt) : 0);
  const updates = { updated_at: new Date().toISOString() };
  const itemUpdates = {};

  if (feedback.outcome === 'completed') {
    Object.assign(updates, {
      is_completed: true,
      status: 'completed',
      remaining_duration_minutes: 0,
      actual_duration_minutes: actualDuration || task.actual_duration_minutes,
      completed_on: completionDate,
      completed_date: completionDate,
      completed_at: completedAt
    });
    Object.assign(itemUpdates, {
      status: 'completed',
      completed_at: updates.completed_at,
      actual_completed_at: updates.completed_at,
      actual_duration_minutes: actualDuration || undefined
    });
  } else if (feedback.outcome === 'return_to_waiting' || feedback.outcome === 'waiting') {
    Object.assign(updates, {
      is_completed: false,
      status: 'pending',
      remaining_duration_minutes: Math.max(15, currentRemaining - actualDuration || Math.ceil(currentRemaining * 0.5)),
      completed_on: null,
      completed_date: null,
      completed_at: null
    });
    Object.assign(itemUpdates, { status: 'waiting' });
  } else {
    Object.assign(updates, {
      is_completed: false,
      status: 'in_progress',
      remaining_duration_minutes: Math.max(15, currentRemaining - actualDuration || currentRemaining),
      completed_on: null,
      completed_date: null,
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
    const completedAt = item.actual_completed_at || item.completed_at || new Date().toISOString();
    const completedDate = dateOnly(completedAt) || dayKey;
    Object.assign(updates, {
      status: 'completed',
      is_completed: true,
      completed_on: completedDate,
      completed_date: completedDate,
      completed_at: completedAt,
      actual_duration_minutes: item.actual_duration_minutes || null,
      remaining_duration_minutes: 0
    });
  } else if (status === 'removed') {
    Object.assign(updates, {
      status: 'removed',
      is_completed: false,
      completed_on: null,
      completed_date: null,
      completed_at: null,
      removed_at: new Date().toISOString()
    });
  } else if (status === 'in_progress') {
    Object.assign(updates, {
      status: 'in_progress',
      is_completed: false,
      completed_on: null,
      completed_date: null,
      completed_at: null
    });
  } else {
    Object.assign(updates, {
      status: 'pending',
      is_completed: false,
      completed_on: null,
      completed_date: null,
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

  const [preferences, tasks, feedbackList, dayItems] = await Promise.all([
    store.getUserPreferences(feedback.user_id),
    store.listTasks(feedback.user_id),
    store.listFeedback(feedback.user_id),
    store.listScheduleItemsForDate(feedback.user_id, sourceSchedule.schedule_date)
  ]);
  const feedbackTime = normalizeDateTimeInput(feedback.created_at) || new Date().toISOString();
  const dayTasks = tasks.filter((task) => (
    shouldTaskBeAvailableForSchedule(task, sourceSchedule.schedule_date) ||
    task.task_id === feedback.task_id
  ));

  const aiHints = await generateScheduleHintsWithAi({
    user_id: feedback.user_id,
    daily_checkin: dailyLog,
    preferences,
    tasks: dayTasks,
    feedback: feedbackList,
    feedback_context: feedback
  });

  const activeTask = dayTasks.find((task) => task.task_id === feedback.task_id) || null;
  const activeItem = buildRescheduledActiveItem(sourceItem, activeTask, feedback, feedbackTime);
  const rescheduleFrom = activeItem?.end_time || feedbackTime;
  const futureDraft = generateDailySchedule({
    userId: feedback.user_id,
    dailyLog,
    preferences: normalizePreferencesForScheduler(preferences),
    tasks: dayTasks,
    feedback: feedbackList,
    scheduleDate: sourceSchedule.schedule_date,
    rescheduleFrom,
    feedbackContext: feedback
  });
  const historyItems = dayItems
    .filter((item) => shouldPreserveHistoryItemDuringReschedule(item, feedbackTime))
    .map(copyScheduleItemForReschedule);
  const draft = {
    ...futureDraft,
    items: [...historyItems, ...(activeItem ? [activeItem] : []), ...futureDraft.items]
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  };

  return saveSchedule(feedback.user_id, dailyLog.log_id, draft, 'rescheduled', aiHints);
}

function buildRescheduledActiveItem(sourceItem, task, feedback, feedbackTime) {
  if (!sourceItem || !task || !['in_progress', 'still_in_progress'].includes(feedback.outcome)) return null;
  const remainingMinutes = Math.max(15, parseInteger(task.remaining_duration_minutes, task.estimated_duration_minutes || 30));
  const actualStartedAt = sourceItem.actual_started_at || sourceItem.started_at || feedbackTime;
  return {
    task_id: task.task_id,
    title: task.title,
    category: task.category || sourceItem.category || null,
    difficulty_level: task.difficulty_level || sourceItem.difficulty_level || null,
    priority_level: task.priority_level || sourceItem.priority_level || null,
    start_time: actualStartedAt,
    end_time: addMinutes(feedbackTime, remainingMinutes).toISOString(),
    energy_slot: sourceItem.energy_slot || 'manual',
    task_kind: sourceItem.task_kind || 'flexible',
    reason: 'Active task timing updated from the latest feedback.',
    status: 'in_progress',
    started_at: actualStartedAt,
    actual_started_at: actualStartedAt
  };
}

function shouldPreserveHistoryItemDuringReschedule(item, feedbackTime) {
  if (item.status === 'completed') return true;
  return isBreakScheduleItem(item) && new Date(item.end_time) <= new Date(feedbackTime);
}

function copyScheduleItemForReschedule(item) {
  return {
    task_id: item.task_id || null,
    title: item.title,
    category: item.category || null,
    difficulty_level: item.difficulty_level || null,
    priority_level: item.priority_level || null,
    start_time: item.start_time,
    end_time: item.end_time,
    energy_slot: item.energy_slot,
    task_kind: item.task_kind,
    reason: item.reason,
    status: item.status,
    started_at: item.started_at || null,
    actual_started_at: item.actual_started_at || null,
    completed_at: item.completed_at || null,
    actual_completed_at: item.actual_completed_at || null,
    actual_duration_minutes: item.actual_duration_minutes || null
  };
}

async function saveSchedule(userId, dailyLogId, draft, status, aiHints = null) {
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
    task_id: item.task_id || null,
    title: item.title,
    category: item.category || null,
    difficulty_level: item.difficulty_level || null,
    priority_level: item.priority_level || null,
    start_time: item.start_time,
    end_time: item.end_time,
    energy_slot: item.energy_slot,
    task_kind: item.task_kind,
    reason: item.reason,
    status: item.status || (item.task_kind === 'break' ? 'break' : 'waiting'),
    started_at: item.started_at || null,
    actual_started_at: item.actual_started_at || null,
    completed_at: item.completed_at || null,
    actual_completed_at: item.actual_completed_at || null,
    actual_duration_minutes: item.actual_duration_minutes || null,
    created_at: new Date().toISOString()
  }));

  const saved = await store.insertScheduleWithItems(schedule, items);
  if (['active', 'rescheduled'].includes(status) && typeof store.archiveGeneratedSchedulesForDate === 'function') {
    await store.archiveGeneratedSchedulesForDate(userId, draft.schedule_date, saved.schedule.schedule_id);
  }
  await saveScheduleNotes(userId, saved.schedule, draft);
  await persistSchedulingAiOutputs(userId, saved.schedule, draft, aiHints);
  await saveDailyEvaluationForDate(userId, draft.schedule_date);
  return saved;
}

async function saveScheduleNotes(userId, schedule, draft) {
  const notes = [
    {
      note_type: 'recommendation',
      title: 'Daily schedule advice',
      message: draft.schedule_note,
      scope: 'daily',
      priority: 3,
      source: 'rule_based'
    }
  ];

  if (draft.items.length === 0) {
    notes.push({
      note_type: 'time_management',
      title: 'No available task blocks',
      message: 'No schedule blocks could be generated. Check your planning window and task durations.',
      scope: 'daily',
      priority: 2,
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

async function ensureAdviceNotes(context) {
  if (!context?.user_id || typeof store.listAiNotes !== 'function' || typeof store.insertAiNote !== 'function') {
    return [];
  }

  const execution = await generateAdviceForContext(context);
  const generatedNotes = normalizeGeneratedAdvice(execution.result.advice, context, {
    taskReferences: execution.request?.taskReferences,
    provenance: normalizeAdviceProvenance(execution.result)
  });
  if (generatedNotes.length === 0) {
    if (!execution.cached && isValidatedOpenAiAdviceResult(execution.result, execution.request)) {
      await persistAdviceRecordsSafely(context, execution.request, execution.result, []);
    }
    return [];
  }

  const existingNotes = await store.listAiNotes(context.user_id);
  const existingKeys = new Set(existingNotes.map(getAdviceDedupKey));
  const notesToSave = generatedNotes.filter((note) => !existingKeys.has(getAdviceDedupKey(note)));
  if (!execution.cached && (notesToSave.length > 0 || isValidatedOpenAiAdviceResult(execution.result, execution.request))) {
    await persistAdviceRecordsSafely(context, execution.request, execution.result, notesToSave);
  }
  if (notesToSave.length === 0) return [];

  return notesToSave;
}

async function generateAdviceForContext(context) {
  const request = isGenerativeAdviceEnabled()
    ? buildAdviceGenerationRequest(context, { maxInputChars: getGenerativeInputLimit() })
    : null;
  const cacheIdentity = buildAdviceCacheIdentity(context, request);
  if (!request || !cacheIdentity) {
    return {
      request,
      cached: false,
      result: await generateAdviceWithAi(buildAdviceEnvelope(context, request), { request })
    };
  }

  const key = buildAdviceSingleFlightKey(cacheIdentity);
  return runAdviceSingleFlight(key, async () => {
    const cached = await findCachedAdviceResult(cacheIdentity.userId, request, cacheIdentity);
    if (cached) return { request, cached: true, result: cached };
    return {
      request,
      cached: false,
      result: await generateAdviceWithAi(buildAdviceEnvelope(context, request), { request })
    };
  });
}

function buildAdviceEnvelope(context, request) {
  if (!request) return context;
  return {
    legacy_context: context,
    generative_context: request.providerContext
  };
}

async function findCachedAdviceResult(userId, request, cacheIdentity) {
  if (typeof store.listAiPredictions !== 'function') return null;
  try {
    const predictions = await store.listAiPredictions(userId, 'advice_generation');
    for (const prediction of predictions) {
      const cached = getCachedAdviceResult(prediction, request, cacheIdentity);
      if (cached) return cached;
    }
  } catch {
    console.warn('[AI] Advice cache lookup skipped.');
  }
  return null;
}

async function persistAdviceRecords(context, request, result, notes) {
  if (!context?.user_id) return;
  const accepted = isValidatedOpenAiAdviceResult(result, request);
  const prediction = {
    prediction_id: createId('pred'),
    user_id: context.user_id,
    related_task_id: context.related_task_id || null,
    related_schedule_id: context.schedule_id || null,
    module_name: 'advice_generation',
    model_name: accepted ? result.model : null,
    source: normalizeAdviceProvenance(result),
    confidence: result.confidence ?? null,
    input_json: buildAdvicePredictionInput(context, request, result),
    output_json: buildAdvicePredictionOutput(result, request),
    created_at: new Date().toISOString()
  };

  if (typeof store.insertAiAdviceResult === 'function') {
    await store.insertAiAdviceResult(notes, prediction);
    return;
  }
  await Promise.all(notes.map((note) => store.insertAiNote(note)));
  await insertIfSupported('insertAiPrediction', prediction);
}

async function persistAdviceRecordsSafely(context, request, result, notes) {
  try {
    await persistAdviceRecords(context, request, result, notes);
  } catch {
    console.warn('[AI] Advice persistence skipped.');
  }
}

function getGenerativeInputLimit() {
  const configured = Number.parseInt(process.env.AI_GENERATIVE_MAX_INPUT_CHARS || '', 10);
  return Number.isInteger(configured) && configured >= 2000 && configured <= 8000 ? configured : 8000;
}

function buildDailyAdviceContext({ userId, date, schedule, items = [], tasks = [], dailyCheckin, feedback = [], dailyEvaluation }) {
  const breakItems = items.filter(isBreakScheduleItem);
  const inferredBreaksCount = countScheduleFreeTimeGaps(items);
  const activeItems = items.filter((item) => item.status !== 'removed' && !isBreakScheduleItem(item));
  const taskItems = groupScheduleItemsByTask(activeItems).map((group) => group.representative);
  const completedItems = taskItems.filter((item) => item.status === 'completed');
  const inProgressItem = taskItems.find((item) => item.status === 'in_progress') || null;
  const waitingItems = taskItems.filter((item) => item.status === 'waiting' || item.status === 'overdue');
  const scheduledTaskIds = new Set(activeItems.map((item) => item.task_id).filter(Boolean));
  const visibleTasks = tasks.filter((task) => isTaskAssignedOrCompletedOnDate(task, date));
  const unscheduledTasks = visibleTasks.filter((task) => !scheduledTaskIds.has(task.task_id) && !isTaskComplete(task));
  const deadlineTasks = visibleTasks
    .filter((task) => task.deadline && !isTaskComplete(task))
    .map((task) => mapTaskForAdvice(task, date))
    .sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));

  const completedTaskCount = Math.max(
    completedItems.length,
    visibleTasks.filter((task) => isTaskComplete(task)).length
  );
  const unfinishedTaskCount = waitingItems.length + (inProgressItem ? 1 : 0) + unscheduledTasks.length;
  const completionPercentage = getCompletionPercentage(completedTaskCount, completedTaskCount + unfinishedTaskCount);

  return {
    user_id: userId,
    date,
    related_date: date,
    scope: 'daily',
    schedule_id: schedule?.schedule_id || null,
    daily_checkin: dailyCheckin || null,
    mood_level: dailyCheckin?.mood_level ?? null,
    energy_level: dailyCheckin?.predicted_energy_level || dailyCheckin?.energy_level || null,
    stress_level: dailyCheckin?.stress_level ?? null,
    sleep_hours: dailyCheckin?.sleep_hours ?? null,
    completed_tasks_count: completedTaskCount,
    unfinished_tasks_count: unfinishedTaskCount,
    completion_percentage: completionPercentage,
    productivity_score: completionPercentage === 100 ? 100 : dailyEvaluation?.productivity_score ?? estimateProductivityScore(completedTaskCount, unfinishedTaskCount),
    waiting_tasks: [
      ...waitingItems.map(mapScheduleItemForAdvice),
      ...unscheduledTasks.map((task) => mapTaskForAdvice(task, date))
    ],
    completed_tasks: completedItems.map(mapScheduleItemForAdvice),
    unfinished_tasks: unscheduledTasks.map((task) => mapTaskForAdvice(task, date)),
    deadline_tasks: deadlineTasks,
    current_task_status: inProgressItem ? mapScheduleItemForAdvice(inProgressItem) : null,
    breaks_count: breakItems.length + inferredBreaksCount,
    task_feedback: feedback,
    feedback_summary: buildFeedbackSummary(feedback, tasks, items)
  };
}

function buildPeriodAdviceContext({ userId, period, startDate, dailyLogs = [], feedback = [], dailyEvaluations = [], tasks = [], scheduleItems = [] }) {
  const filteredLogs = dailyLogs.filter((log) => dateOnly(log.log_date || log.created_at) >= startDate);
  const filteredFeedback = feedback.filter((item) => dateOnly(item.created_at) >= startDate);
  const filteredEvaluations = dailyEvaluations.filter((evaluation) => dateOnly(evaluation.evaluation_date) >= startDate);
  const filteredItems = scheduleItems.filter((item) => dateOnly(item.start_time || item.created_at) >= startDate);
  const filteredTasks = tasks.filter((task) => (dateOnly(task.completed_date || task.completed_on || task.completed_at || task.task_date || task.created_at) || todayKey()) >= startDate);
  const completedTasks = filteredTasks.filter(isTaskComplete);
  const unfinishedTasks = filteredTasks.filter((task) => !isTaskComplete(task) && !['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase()));
  const averageProductivity = averageNumber(filteredEvaluations.map((evaluation) => evaluation.productivity_score));

  return {
    user_id: userId,
    date: todayKey(),
    related_date: todayKey(),
    period,
    scope: normalizeAdviceScope(period),
    start_date: startDate,
    daily_checkins: filteredLogs,
    daily_logs: filteredLogs,
    daily_evaluations: filteredEvaluations,
    task_feedback: enrichFeedbackForAdvice(filteredFeedback, tasks, scheduleItems),
    schedule_items: filteredItems,
    tasks: filteredTasks,
    completed_tasks_count: completedTasks.length,
    unfinished_tasks_count: unfinishedTasks.length,
    productivity_score: averageProductivity === null ? null : Math.round(averageProductivity),
    feedback_summary: buildFeedbackSummary(filteredFeedback, tasks, scheduleItems)
  };
}

function filterScheduleItemsForDisplayDate(items = [], tasks = [], date, completedHistory = []) {
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const reconciledItems = reconcileScheduleItemsForDate(items, completedHistory, tasks, date);
  return reconciledItems.filter((item) => {
    const task = taskById.get(item.task_id) || item.task || null;
    const taskStatus = String(task?.status || '').toLowerCase();
    if (['removed', 'deleted', 'cancelled'].includes(taskStatus) && !isTaskComplete(task)) {
      return false;
    }
    const completionDate = getCompletionDateForItem(item, task);
    if (!completionDate) return true;
    return completionDate === date;
  });
}

function filterAdviceNotesForCheckin(notes = [], dailyCheckin = null) {
  if (!dailyCheckin) return notes;
  const energy = parseInteger(dailyCheckin.predicted_energy_level || dailyCheckin.energy_level, 3);
  const stress = parseInteger(dailyCheckin.stress_level, 3);
  const mood = parseInteger(dailyCheckin.mood_level, 3);
  const sleepHours = Number.parseFloat(dailyCheckin.sleep_hours || 0);
  const strongEnergyDay = energy >= 4 && stress <= 2 && mood >= 4 && sleepHours >= 7 && !parseBoolean(dailyCheckin.is_tired);
  if (!strongEnergyDay) return notes;
  return notes.filter((note) => {
    const noteText = `${note.note_type || ''} ${note.title || ''} ${note.message || ''}`.toLowerCase();
    return !noteText.includes('low energy') && !noteText.includes('low-energy') && !noteText.includes('energy is low');
  });
}

function selectLatestDailyAdviceNotes(notes = []) {
  if (notes.length <= 6) return notes;
  const sorted = [...notes].sort((a, b) => new Date(b.created_at || b.note_date || 0) - new Date(a.created_at || a.note_date || 0));
  const latestTime = new Date(sorted[0]?.created_at || sorted[0]?.note_date || 0).getTime();
  const latestBatch = sorted.filter((note) => {
    const noteTime = new Date(note.created_at || note.note_date || 0).getTime();
    return Number.isFinite(noteTime) && Number.isFinite(latestTime) && Math.abs(latestTime - noteTime) <= 120000;
  });
  const currentNotes = latestBatch.length >= 3 ? latestBatch : sorted.slice(0, 6);
  const complexDay = currentNotes.some((note) => {
    const noteType = String(note.note_type || note.advice_type || '').toLowerCase();
    const priority = parseInteger(note.priority, 3);
    return priority <= 1 || ['deadline', 'stress', 'time_management', 'feedback'].includes(noteType);
  });
  return currentNotes
    .sort((a, b) => parseInteger(a.priority, 3) - parseInteger(b.priority, 3))
    .slice(0, complexDay ? 12 : 6);
}

function getCompletionDateForItem(item, task = null) {
  return dateOnly(
    item?.actual_completed_at ||
    item?.completed_at ||
    task?.completed_date ||
    task?.completed_on ||
    task?.completed_at
  );
}

function normalizeGeneratedAdvice(advice, context, options = {}) {
  if (!Array.isArray(advice)) return [];
  return advice
    .map((note) => {
      const title = String(note?.title || '').trim();
      const message = String(note?.message || '').trim();
      if (!title || !message) return null;
      return {
        note_id: createId('note'),
        user_id: context.user_id,
        note_date: dateOnly(note.related_date || context.related_date || context.date) || todayKey(),
        schedule_id: context.schedule_id || null,
        related_task_id: note.task_ref
          ? options.taskReferences?.[note.task_ref] || null
          : note.related_task_id || null,
        note_type: String(note.advice_type || note.note_type || 'recommendation').slice(0, 40),
        title: title.slice(0, 160),
        message,
        scope: normalizeAdviceScope(note.scope || context.scope),
        priority: clampNumber(parseInteger(note.priority, 3), 1, 5),
        source: LEGACY_AI_NOTE_SOURCE,
        created_at: new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function buildFeedbackSummary(feedback = [], tasks = [], scheduleItems = []) {
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const itemById = new Map(scheduleItems.map((item) => [item.schedule_item_id, item]));
  const enriched = enrichFeedbackForAdvice(feedback, tasks, scheduleItems);
  const overruns = enriched.filter((item) => item.actual_duration_minutes && item.planned_duration_minutes && item.actual_duration_minutes > item.planned_duration_minutes * 1.25);
  const latestOverrun = overruns[overruns.length - 1] || null;
  const difficultFeedback = enriched.filter((item) => parseOptionalInteger(item.difficulty_feedback) >= 4);
  const latestDifficult = difficultFeedback[difficultFeedback.length - 1] || null;
  const relatedTask = latestOverrun ? taskById.get(latestOverrun.task_id) : null;
  const relatedItem = latestOverrun ? itemById.get(latestOverrun.schedule_item_id) : null;
  const difficultTask = latestDifficult ? taskById.get(latestDifficult.task_id) : null;
  const difficultItem = latestDifficult ? itemById.get(latestDifficult.schedule_item_id) : null;

  return {
    feedback_count: feedback.length,
    completed_feedback_count: feedback.filter((item) => item.completed || item.outcome === 'completed').length,
    overrun_count: overruns.length,
    latest_overrun_task: relatedTask?.title || relatedItem?.title || null,
    latest_overrun_task_id: latestOverrun?.task_id || null,
    difficult_count: difficultFeedback.length,
    latest_difficult_task: difficultTask?.title || difficultItem?.title || null,
    latest_difficult_task_id: latestDifficult?.task_id || null,
    comments: feedback.map((item) => item.comment).filter(Boolean).slice(-3)
  };
}

function enrichFeedbackForAdvice(feedback = [], tasks = [], scheduleItems = []) {
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const itemById = new Map(scheduleItems.map((item) => [item.schedule_item_id, item]));
  return feedback.map((item) => {
    const task = taskById.get(item.task_id);
    const scheduleItem = itemById.get(item.schedule_item_id);
    return {
      ...item,
      title: task?.title || scheduleItem?.title || null,
      planned_duration_minutes: getPlannedDurationMinutes(task, scheduleItem)
    };
  });
}

function mapScheduleItemForAdvice(item) {
  const subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
  const completedSubtasks = subtasks.filter((subtask) => Boolean(subtask.is_completed)).length;
  return {
    task_id: item.task_id || null,
    schedule_item_id: item.schedule_item_id || null,
    title: item.title,
    description: item.description || item.task?.description || null,
    category: item.category || item.task?.category || null,
    status: item.status,
    priority_level: item.priority_level || item.task?.priority_level || null,
    difficulty_level: item.difficulty_level || item.task?.difficulty_level || null,
    task_kind: item.task_kind,
    start_time: item.start_time,
    end_time: item.end_time,
    planned_duration_minutes: getDurationMinutes(item.start_time, item.end_time),
    actual_duration_minutes: parseOptionalInteger(item.actual_duration_minutes),
    progress_percentage: getSubtaskProgress(item),
    subtask_completed_count: completedSubtasks,
    subtask_total_count: subtasks.length
  };
}

function mapTaskForAdvice(task, date) {
  return {
    task_id: task.task_id,
    title: task.title,
    description: task.description || null,
    category: task.category || null,
    status: task.status,
    priority_level: task.priority_level || null,
    difficulty_level: task.difficulty_level || null,
    estimated_duration_minutes: parseOptionalInteger(task.estimated_duration_minutes),
    deadline: task.deadline || null,
    days_left: task.deadline ? daysBetween(date, dateOnly(task.deadline)) : null
  };
}

function getSubtaskProgress(item) {
  const subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
  if (subtasks.length === 0) return null;
  const completed = subtasks.filter((subtask) => Boolean(subtask.is_completed)).length;
  return Math.round((completed / subtasks.length) * 100);
}

function getPlannedDurationMinutes(task, scheduleItem) {
  const scheduleDuration = scheduleItem ? getDurationMinutes(scheduleItem.start_time, scheduleItem.end_time) : 0;
  return scheduleDuration || parseOptionalInteger(task?.estimated_duration_minutes) || null;
}

function estimateProductivityScore(completedCount, unfinishedCount) {
  const total = completedCount + unfinishedCount;
  if (total === 0) return null;
  return Math.round((completedCount / total) * 100);
}

function isTaskComplete(task) {
  return parseBoolean(task?.is_completed) ||
    String(task?.status || '').toLowerCase() === 'completed' ||
    Boolean(task?.completed_date || task?.completed_on || task?.completed_at);
}

function isBreakScheduleItem(item = {}) {
  const kind = String(item.task_kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const category = String(item.category || item.task?.category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const energySlot = String(item.energy_slot || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const title = String(item.title || '').trim().toLowerCase();
  const values = [kind, category, energySlot];
  return values.some((value) => ['break', 'free', 'free_time', 'empty', 'empty_time', 'rest', 'rest_period'].includes(value)) ||
    ['break', 'break time', 'short break', 'rest break', 'free time', 'empty time', 'rest period'].includes(title);
}

function countScheduleFreeTimeGaps(items = []) {
  const scheduleBlocks = items
    .filter((item) => item.status !== 'removed')
    .filter((item) => isValidDate(new Date(item.start_time)) && isValidDate(new Date(item.end_time)))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  let gapCount = 0;

  for (let index = 0; index < scheduleBlocks.length - 1; index += 1) {
    const currentEnd = new Date(scheduleBlocks[index].end_time);
    const nextStart = new Date(scheduleBlocks[index + 1].start_time);
    if (dateOnly(currentEnd) !== dateOnly(nextStart)) continue;
    const gapMinutes = Math.round((nextStart - currentEnd) / 60000);
    if (gapMinutes >= 10) gapCount += 1;
  }

  return gapCount;
}

function normalizeAdviceScope(scope) {
  const value = String(scope || 'daily').toLowerCase();
  if (['daily', 'weekly', 'monthly', 'task'].includes(value)) return value;
  return value === 'week' ? 'weekly' : 'daily';
}

function getAdviceDedupKey(note) {
  return [
    dateOnly(note.note_date || note.created_at),
    note.scope || 'daily',
    note.note_type || 'recommendation',
    note.related_task_id || '',
    note.title || '',
    note.message || ''
  ].join('|');
}

function averageNumber(values) {
  const numbers = values
    .map((value) => Number.parseFloat(value))
    .filter((value) => !Number.isNaN(value));
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${dateOnly(startDate) || todayKey()}T00:00:00`);
  const end = new Date(`${dateOnly(endDate) || todayKey()}T00:00:00`);
  if (!isValidDate(start) || !isValidDate(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function persistMoodAiOutputs(savedCheckin, input, analysis) {
  if (!savedCheckin?.user_id || !analysis) return;
  const now = new Date().toISOString();
  await Promise.allSettled([
    insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: savedCheckin.user_id,
      related_checkin_id: savedCheckin.checkin_id || savedCheckin.log_id,
      module_name: 'mood_analysis',
      model_name: analysis.model || null,
      source: analysis.source || 'python_ai_service',
      confidence: analysis.confidence ?? null,
      input_json: input,
      output_json: analysis,
      created_at: now
    }),
    insertIfSupported('insertEmotionLog', {
      emotion_log_id: createId('emotion'),
      user_id: savedCheckin.user_id,
      checkin_id: savedCheckin.checkin_id || savedCheckin.log_id,
      emotion: analysis.detected_emotion || null,
      predicted_mood: analysis.predicted_mood || analysis.detected_emotion || null,
      stress_estimation: parseOptionalInteger(analysis.stress_estimation),
      fatigue_detected: Boolean(analysis.fatigue_detected),
      fatigue_score: parseOptionalInteger(analysis.fatigue_score),
      source: analysis.source || 'python_ai_service',
      created_at: now
    }),
    insertIfSupported('insertEnergyPrediction', {
      energy_prediction_id: createId('energy'),
      user_id: savedCheckin.user_id,
      checkin_id: savedCheckin.checkin_id || savedCheckin.log_id,
      predicted_energy_level: parseInteger(analysis.predicted_energy_level, savedCheckin.predicted_energy_level || savedCheckin.energy_level || 3),
      energy_insight: analysis.energy_insights || analysis.ai_advice || null,
      confidence: analysis.confidence ?? null,
      source: analysis.source || 'python_ai_service',
      created_at: now
    }),
    insertIfSupported('insertRecommendation', {
      recommendation_id: createId('rec'),
      user_id: savedCheckin.user_id,
      recommendation_date: dateOnly(savedCheckin.log_date || savedCheckin.checkin_date) || todayKey(),
      recommendation_type: 'mood_energy',
      title: 'Mood and energy recommendation',
      message: analysis.ai_advice || analysis.energy_insights || 'Use daily check-in signals to tune today schedule.',
      source: analysis.source || 'python_ai_service',
      confidence: analysis.confidence ?? null,
      created_at: now
    })
  ]);
}

async function persistTaskAiOutputs(savedTask, input, aiOutputs = {}) {
  if (!savedTask?.user_id) return;
  const now = new Date().toISOString();
  const writes = [];

  if (aiOutputs.classification) {
    writes.push(insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: savedTask.user_id,
      related_task_id: savedTask.task_id,
      module_name: 'task_classification',
      model_name: aiOutputs.classification.model || null,
      source: aiOutputs.classification.source || 'python_ai_service',
      confidence: aiOutputs.classification.confidence ?? null,
      input_json: input,
      output_json: aiOutputs.classification,
      created_at: now
    }));
  }

  if (aiOutputs.timeEstimation) {
    writes.push(insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: savedTask.user_id,
      related_task_id: savedTask.task_id,
      module_name: 'time_estimation',
      model_name: aiOutputs.timeEstimation.model || null,
      source: aiOutputs.timeEstimation.source || 'python_ai_service',
      confidence: aiOutputs.timeEstimation.confidence ?? null,
      input_json: input,
      output_json: aiOutputs.timeEstimation,
      created_at: now
    }));
  }

  await Promise.allSettled(writes);
}

async function persistSchedulingAiOutputs(userId, schedule, draft, aiHints) {
  if (!userId || !schedule) return;
  const now = new Date().toISOString();
  await Promise.allSettled([
    insertIfSupported('insertSchedulingResult', {
      scheduling_result_id: createId('schedai'),
      user_id: userId,
      schedule_id: schedule.schedule_id,
      schedule_date: draft.schedule_date,
      ai_hints_json: aiHints || {},
      rule_summary_json: {
        schedule_note: draft.schedule_note,
        item_count: draft.items.length,
        fixed_count: draft.items.filter((item) => item.task_kind === 'fixed').length,
        flexible_count: draft.items.filter((item) => item.task_kind !== 'fixed').length
      },
      final_decision_owner: 'node_rule_based_scheduler',
      created_at: now
    }),
    aiHints ? insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: userId,
      related_schedule_id: schedule.schedule_id,
      module_name: 'scheduler_hints',
      model_name: aiHints.model || null,
      source: aiHints.source || 'python_ai_service',
      confidence: aiHints.confidence ?? null,
      input_json: { schedule_date: draft.schedule_date },
      output_json: aiHints,
      created_at: now
    }) : Promise.resolve(),
    aiHints?.recommendations?.[0] ? insertIfSupported('insertRecommendation', {
      recommendation_id: createId('rec'),
      user_id: userId,
      recommendation_date: draft.schedule_date,
      related_schedule_id: schedule.schedule_id,
      recommendation_type: 'scheduler_hint',
      title: 'AI scheduling hint',
      message: aiHints.recommendations[0],
      source: aiHints.source || 'python_ai_service',
      confidence: aiHints.confidence ?? null,
      created_at: now
    }) : Promise.resolve()
  ]);
}

async function ensureAiSubtasksForItem(userId, item) {
  if (!item?.schedule_item_id || typeof store.replaceSubtasksForScheduleItem !== 'function') return [];
  const existingSubtasks = typeof store.listSubtasksForScheduleItem === 'function'
    ? await store.listSubtasksForScheduleItem(item.schedule_item_id)
    : item.subtasks || [];
  const task = item.task || (item.task_id ? await store.getTask(item.task_id) : null);
  const input = {
    user_id: userId,
    task_id: item.task_id,
    schedule_item_id: item.schedule_item_id,
    title: task?.title || item.title,
    description: task?.description || item.reason || '',
    category: task?.category || item.category,
    difficulty_level: task?.difficulty_level || item.difficulty_level,
    priority_level: task?.priority_level || item.priority_level,
    estimated_duration_minutes: task?.estimated_duration_minutes || getDurationMinutes(item.start_time, item.end_time)
  };

  if (existingSubtasks.length > 0) {
    return existingSubtasks;
  }

  if (isSimpleBreakdownInput(input)) {
    await store.replaceSubtasksForScheduleItem(item.schedule_item_id, []);
    return [];
  }

  const generated = await generateSubtasksWithAi(input);
  if (generated.skipped || generated.reason === 'simple_task') {
    await store.replaceSubtasksForScheduleItem(item.schedule_item_id, []);
    await insertIfSupported('insertAiPrediction', {
      prediction_id: createId('pred'),
      user_id: userId,
      related_task_id: item.task_id,
      related_schedule_id: item.schedule_id,
      module_name: 'subtask_generation',
      model_name: safeSubtaskPredictionModel(generated),
      source: normalizeSubtaskProvenance(generated),
      confidence: generated.confidence ?? null,
      input_json: buildSubtaskPredictionInput(input, generated),
      output_json: buildSubtaskPredictionOutput(generated),
      created_at: new Date().toISOString()
    });
    return [];
  }

  const generatedByOpenAi = isValidatedOpenAiSubtaskResult(generated);
  const subtasks = normalizeGeneratedSubtasks(generated.subtasks).map((subtask, index) => ({
    subtask_id: createId('subtask'),
    user_id: userId,
    task_id: item.task_id,
    schedule_item_id: item.schedule_item_id,
    title: subtask.title,
    is_completed: false,
    order_index: subtask.order_index || index + 1,
    sort_order: subtask.order_index || index + 1,
    generated_by_ai: generatedByOpenAi,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  if (subtasks.length === 0) return existingSubtasks;
  const savedSubtasks = await store.replaceSubtasksForScheduleItem(item.schedule_item_id, subtasks);
  await insertIfSupported('insertAiPrediction', {
    prediction_id: createId('pred'),
    user_id: userId,
    related_task_id: item.task_id,
    related_schedule_id: item.schedule_id,
    module_name: 'subtask_generation',
    model_name: safeSubtaskPredictionModel(generated),
    source: normalizeSubtaskProvenance(generated),
    confidence: generated.confidence ?? null,
    input_json: buildSubtaskPredictionInput(input, generated),
    output_json: buildSubtaskPredictionOutput(generated),
    created_at: new Date().toISOString()
  });
  return savedSubtasks;
}

function isSimpleBreakdownInput(input = {}) {
  const title = String(input.title || '').toLowerCase();
  const description = String(input.description || '').toLowerCase();
  const category = String(input.category || '').toLowerCase();
  const signals = `${title} ${description} ${category}`;
  const difficulty = parseInteger(input.difficulty_level, 3);
  const duration = parseInteger(input.estimated_duration_minutes, 60);
  const priority = parseInteger(input.priority_level, 3);
  const simpleRoutine = ['routine', 'personal', 'health', 'home', 'household'].includes(category) ||
    hasBreakdownKeyword(signals, ['skin care', 'skincare', 'shower', 'brush', 'breakfast', 'lunch', 'dinner', 'walk', 'laundry', 'tidy', 'clean room', 'routine']);
  const complexCategory = ['study', 'coding', 'writing', 'project', 'design', 'presentation'].includes(category) ||
    hasBreakdownKeyword(signals, ['project', 'presentation', 'poster', 'report', 'essay', 'code', 'database', 'api', 'research', 'exam', 'design', 'slides']);
  const multipleParts = hasMultipleBreakdownParts(description);

  if (duration < 60 && difficulty <= 2 && priority <= 3 && (simpleRoutine || !complexCategory)) return true;
  if (duration < 45 && difficulty <= 2 && priority <= 3 && !multipleParts) return true;
  return false;
}

function hasBreakdownKeyword(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}

function hasMultipleBreakdownParts(value) {
  if (!value) return false;
  const separators = (value.match(/,/g) || []).length +
    (value.match(/;/g) || []).length +
    (value.match(/\sand\s/g) || []).length +
    (value.match(/\sthen\s/g) || []).length;
  const actionWords = (value.match(/\b(update|add|fix|remove|export|review|write|collect|test|design|prepare)\b/g) || []).length;
  return separators >= 2 || actionWords >= 3;
}

function normalizeGeneratedSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return [];
  return subtasks
    .map((subtask, index) => ({
      title: String(subtask?.title || '').trim(),
      order_index: parseInteger(subtask?.order_index, index + 1)
    }))
    .filter((subtask) => subtask.title)
    .slice(0, 6);
}

async function saveDailyEvaluationForDate(userId, date) {
  const completedHistoryRequest = typeof store.listCompletedScheduleItemsForDate === 'function'
    ? store.listCompletedScheduleItemsForDate(userId, date)
    : Promise.resolve([]);
  const [currentItems, completedHistory, tasks, dailyLogs, schedules] = await Promise.all([
    store.listScheduleItemsForDate(userId, date),
    completedHistoryRequest,
    store.listTasks(userId),
    store.listDailyLogs(userId),
    store.listSchedules(userId)
  ]);
  const items = filterScheduleItemsForDisplayDate(currentItems, tasks, date, completedHistory);
  const dayLog = dailyLogs.find((log) => dateOnly(log.log_date) === date);
  const schedule = latestRecord(schedules.filter((item) => dateOnly(item.schedule_date) === date), 'generated_at');
  const activeItems = items.filter((item) => item.status !== 'removed' && !isBreakScheduleItem(item));
  const taskGroups = groupScheduleItemsByTask(activeItems);
  const completedGroups = taskGroups.filter((group) => group.representative.status === 'completed');
  const totalTasks = taskGroups.length;
  const completedTasks = completedGroups.length;
  const unfinishedTasks = Math.max(0, totalTasks - completedTasks);
  const completionPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const plannedMinutes = taskGroups.reduce((sum, group) => sum + group.planned_minutes, 0);
  const actualMinutes = completedGroups.reduce((sum, group) => {
    const item = group.representative;
    const actual = parseOptionalInteger(item.actual_duration_minutes);
    return sum + (actual || getDurationMinutes(item.actual_started_at || item.started_at || item.start_time, item.actual_completed_at || item.completed_at || item.end_time));
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
      const completedAt = now.toISOString();
      await updateScheduleItemStatus(item.schedule_item_id, {
        status: 'completed',
        automatic: true,
        completed_at: completedAt,
        actual_completed_at: completedAt,
        actual_duration_minutes: getDurationMinutes(item.actual_started_at || item.started_at || item.start_time, completedAt)
      });
      continue;
    }
    if (now >= start && now < end && item.status !== 'in_progress') {
      const startedAt = now.toISOString();
      await updateScheduleItemStatus(item.schedule_item_id, {
        status: 'in_progress',
        automatic: true,
        started_at: startedAt,
        actual_started_at: startedAt
      });
    }
  }
}

async function buildTaskRecord(input) {
  const classification = await classifyTaskWithAi(input);
  const taskInput = {
    ...input,
    category: input.category || classification.task_category,
    task_type: input.task_type || classification.task_type
  };
  const enriched = categorizeTask(taskInput);
  let timeEstimation = null;
  if (!input.estimated_duration_minutes || Number.parseInt(input.estimated_duration_minutes, 10) <= 0) {
    timeEstimation = await estimateTimeWithAi({
      ...taskInput,
      task_category: enriched.category,
      task_description: input.description,
      difficulty_level: input.difficulty_level || enriched.difficulty_level
    });
    enriched.estimated_duration_minutes = parseInteger(
      timeEstimation.estimated_duration_minutes,
      enriched.estimated_duration_minutes
    );
  }
  const isFixed = Boolean(input.is_fixed_time || taskInput.task_type === 'fixed');
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
    assigned_date: input.assigned_date || input.schedule_date || input.task_date || deriveTaskDate({ ...input, is_fixed_time: isFixed }),
    schedule_date: input.schedule_date || input.assigned_date || input.task_date || deriveTaskDate({ ...input, is_fixed_time: isFixed }),
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

  return {
    task,
    aiOutputs: {
      classification,
      timeEstimation
    }
  };
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
    assigned_date: input.assigned_date,
    schedule_date: input.schedule_date,
    deadline: input.deadline !== undefined ? normalizeDateTimeInput(input.deadline) : undefined,
    is_fixed_time: isFixed,
    fixed_date: isFixed ? input.fixed_date || existing.fixed_date || input.task_date : null,
    fixed_start_time: isFixed ? input.fixed_start_time || existing.fixed_start_time : null,
    fixed_end_time: isFixed ? input.fixed_end_time || existing.fixed_end_time : null,
    status: input.status,
    is_completed: input.is_completed,
    completed_on: input.completed_on,
    completed_date: input.completed_date || input.completed_on,
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
    const startedAt = input.actual_started_at || input.started_at || now;
    return {
      status,
      started_at: startedAt,
      actual_started_at: startedAt,
      restored_at: input.restored_at || item.restored_at || null
    };
  }
  if (status === 'completed') {
    const completedAt = input.actual_completed_at || input.completed_at || now;
    const actualDuration = calculateActualDurationFromItem(item, completedAt) ||
      parseOptionalInteger(input.actual_duration_minutes) ||
      getDurationMinutes(item.start_time, item.end_time);
    return {
      status,
      completed_at: completedAt,
      actual_completed_at: completedAt,
      actual_duration_minutes: actualDuration
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
  if (task.status === 'removed' || task.status === 'deleted' || task.status === 'in_progress' || task.is_completed) return false;
  if (task.is_fixed_time) return dateOnly(task.fixed_date) === targetDate;
  return isTaskAssignedToDate(task, targetDate);
}

function isTaskVisibleOnDate(task, targetDate) {
  if (!task || ['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase())) return false;
  if (task.is_fixed_time) return dateOnly(task.fixed_date) === targetDate;

  const completedDate = dateOnly(task.completed_date || task.completed_on || task.completed_at);
  if (completedDate) return completedDate === targetDate;

  const startDate = dateOnly(task.task_date || task.created_at);
  const deadlineDate = dateOnly(task.deadline);
  if (startDate && targetDate < startDate) return false;
  if (deadlineDate && targetDate <= deadlineDate) return true;
  return startDate === targetDate;
}

function isTaskAssignedToDate(task, targetDate) {
  if (!task || !targetDate) return false;
  if (task.is_fixed_time) return dateOnly(task.fixed_date) === targetDate;
  return getTaskAssignedDate(task) === targetDate;
}

function isTaskAssignedOrCompletedOnDate(task, targetDate) {
  if (!task || ['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase())) return false;
  const completedDate = dateOnly(task.completed_date || task.completed_on || task.completed_at);
  if (completedDate) return completedDate === targetDate;
  return isTaskAssignedToDate(task, targetDate);
}

function getTaskAssignedDate(task) {
  if (!task) return null;
  if (task.is_fixed_time) return dateOnly(task.fixed_date);
  return dateOnly(task.assigned_date || task.schedule_date || task.task_date || task.created_at);
}

function getPreviousUnfinishedTasks(tasks = [], targetDate) {
  return tasks
    .filter((task) => !task.is_fixed_time)
    .filter((task) => !isTaskComplete(task))
    .filter((task) => !['removed', 'deleted', 'cancelled'].includes(String(task.status || '').toLowerCase()))
    .filter((task) => {
      const assignedDate = getTaskAssignedDate(task);
      return assignedDate && assignedDate < targetDate;
    })
    .sort((a, b) => (getTaskAssignedDate(b) || '').localeCompare(getTaskAssignedDate(a) || ''));
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

function getCompletionPercentage(completedTasks, totalTasks) {
  if (!totalTasks) return 0;
  if (completedTasks >= totalTasks) return 100;
  return Math.round((completedTasks / totalTasks) * 100);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

async function insertIfSupported(methodName, record) {
  if (typeof store[methodName] !== 'function') return null;
  return store[methodName](record);
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

function buildScheduleTimeOnDate(dayKey, timeSource) {
  const source = new Date(timeSource);
  if (!isValidDate(source)) return `${dayKey}T09:00:00`;
  return new Date(`${dayKey}T${[
    String(source.getHours()).padStart(2, '0'),
    String(source.getMinutes()).padStart(2, '0'),
    String(source.getSeconds()).padStart(2, '0')
  ].join(':')}`).toISOString();
}

function addMinutes(value, minutes) {
  const date = new Date(value);
  if (!isValidDate(date)) return new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function calculateActualDurationFromItem(item, completedAt) {
  const actualStart = item?.actual_started_at || item?.started_at;
  if (!actualStart || !completedAt) return null;
  return getDurationMinutes(actualStart, completedAt) || null;
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
