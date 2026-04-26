import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyzeMoodEnergy, categorizeTask } from './ai.js';
import { createId, latestRecord, readData, writeData } from './database.js';
import { generateDailySchedule } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const clientDir = path.join(rootDir, 'client');
const port = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: 'Internal server error', details: error.message });
  }
}).listen(port, () => {
  console.log(`Smart Day Planner running at http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const data = await readData();
    const userId = url.searchParams.get('userId') || 'user_demo';
    const schedules = data.schedules.filter((item) => item.user_id === userId);
    const latestSchedule = latestRecord(schedules, 'generated_at');
    sendJson(res, 200, {
      user: data.users.find((item) => item.user_id === userId),
      preferences: data.user_preferences.find((item) => item.user_id === userId),
      latest_daily_log: latestRecord(data.daily_logs.filter((item) => item.user_id === userId)),
      tasks: data.tasks.filter((item) => item.user_id === userId),
      latest_schedule: latestSchedule,
      latest_schedule_items: latestSchedule
        ? data.schedule_items.filter((item) => item.schedule_id === latestSchedule.schedule_id)
        : []
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/daily-logs') {
    const body = await readJsonBody(req);
    const record = {
      log_id: createId('log'),
      user_id: body.user_id || 'user_demo',
      log_date: body.log_date || new Date().toISOString().slice(0, 10),
      mood_level: Number.parseInt(body.mood_level, 10) || 3,
      energy_level: Number.parseInt(body.energy_level, 10) || 3,
      stress_level: Number.parseInt(body.stress_level, 10) || 3,
      sleep_hours: Number.parseFloat(body.sleep_hours) || 7,
      is_tired: Boolean(body.is_tired),
      planning_start: body.planning_start || null,
      planning_end: body.planning_end || null,
      mood_text_original: body.mood_text_original || '',
      ...analyzeMoodEnergy(body),
      created_at: new Date().toISOString()
    };

    const data = await readData();
    data.daily_logs.push(record);
    await writeData(data);
    sendJson(res, 201, { daily_log: record });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const data = await readData();
    const userId = url.searchParams.get('userId') || 'user_demo';
    sendJson(res, 200, { tasks: data.tasks.filter((item) => item.user_id === userId) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readJsonBody(req);
    const enriched = categorizeTask(body);
    const task = {
      task_id: createId('task'),
      user_id: body.user_id || 'user_demo',
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      ...enriched,
      priority_level: Number.parseInt(body.priority_level, 10) || 3,
      remaining_duration_minutes: enriched.estimated_duration_minutes,
      deadline: body.deadline || null,
      status: 'pending',
      is_completed: false,
      is_fixed_time: Boolean(body.is_fixed_time),
      fixed_date: body.is_fixed_time ? body.fixed_date || null : null,
      fixed_start_time: body.is_fixed_time ? body.fixed_start_time || null : null,
      fixed_end_time: body.is_fixed_time ? body.fixed_end_time || null : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!task.title) {
      sendJson(res, 400, { error: 'Task title is required.' });
      return;
    }

    if (task.is_fixed_time) {
      const validationError = validateFixedTask(task);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
    }

    const data = await readData();
    if (task.is_fixed_time) {
      const conflict = findFixedConflict(data.tasks.filter((item) => item.user_id === task.user_id && item.is_fixed_time && !item.is_completed), task);
      if (conflict) {
        sendJson(res, 409, { error: `This fixed-time task overlaps with "${conflict.title}".` });
        return;
      }
    }

    data.tasks.push(task);
    await writeData(data);
    sendJson(res, 201, { task });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/schedules/generate') {
    const body = await readJsonBody(req);
    const data = await readData();
    const userId = body.user_id || 'user_demo';
    const preferences = data.user_preferences.find((item) => item.user_id === userId);
    const dailyLogs = data.daily_logs.filter((item) => item.user_id === userId);
    const dailyLog = body.daily_log_id
      ? dailyLogs.find((item) => item.log_id === body.daily_log_id)
      : latestRecord(dailyLogs);

    if (!dailyLog) {
      sendJson(res, 400, { error: 'Please save a daily check-in before generating the schedule.' });
      return;
    }

    const draft = generateDailySchedule({
      userId,
      dailyLog,
      preferences,
      tasks: data.tasks.filter((item) => item.user_id === userId),
      feedback: data.feedback.filter((item) => item.user_id === userId)
    });

    const saved = saveSchedule(data, userId, dailyLog.log_id, draft, 'active');
    await writeData(data);
    sendJson(res, 201, saved);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/feedback') {
    const body = await readJsonBody(req);
    const data = await readData();
    const feedback = {
      feedback_id: createId('feedback'),
      user_id: body.user_id || 'user_demo',
      task_id: body.task_id,
      schedule_item_id: body.schedule_item_id || null,
      completed: Boolean(body.completed),
      actual_duration_minutes: Number.parseInt(body.actual_duration_minutes, 10) || null,
      difficulty_feedback: Number.parseInt(body.difficulty_feedback, 10) || null,
      energy_after: Number.parseInt(body.energy_after, 10) || null,
      mood_after: Number.parseInt(body.mood_after, 10) || null,
      comment: body.comment || '',
      created_at: new Date().toISOString()
    };
    data.feedback.push(feedback);

    const task = data.tasks.find((item) => item.task_id === feedback.task_id);
    if (task) {
      const currentRemaining = Number.parseInt(task.remaining_duration_minutes, 10) || Number.parseInt(task.estimated_duration_minutes, 10) || 0;
      const actualDuration = feedback.actual_duration_minutes || 0;

      if (feedback.completed) {
        task.is_completed = true;
        task.status = 'completed';
        task.remaining_duration_minutes = 0;
      } else {
        task.status = 'pending';
        task.is_completed = false;
        task.remaining_duration_minutes = Math.max(15, currentRemaining - actualDuration || Math.ceil(currentRemaining * 0.5));
      }

      if (feedback.difficulty_feedback) {
        task.difficulty_level = Math.max(task.difficulty_level, feedback.difficulty_feedback);
      }
      task.updated_at = new Date().toISOString();
    }

    let updated_schedule = null;
    let updated_items = [];

    if (feedback.schedule_item_id) {
      const sourceItem = data.schedule_items.find((item) => item.schedule_item_id === feedback.schedule_item_id);
      const sourceSchedule = sourceItem ? data.schedules.find((item) => item.schedule_id === sourceItem.schedule_id) : null;
      const sourceDailyLog = sourceSchedule ? data.daily_logs.find((item) => item.log_id === sourceSchedule.daily_log_id) : null;
      const preferences = data.user_preferences.find((item) => item.user_id === feedback.user_id);

      if (sourceItem && sourceSchedule && sourceDailyLog) {
        const draft = generateDailySchedule({
          userId: feedback.user_id,
          dailyLog: sourceDailyLog,
          preferences,
          tasks: data.tasks.filter((item) => item.user_id === feedback.user_id),
          feedback: data.feedback.filter((item) => item.user_id === feedback.user_id),
          scheduleDate: sourceSchedule.schedule_date,
          rescheduleFrom: sourceItem.end_time,
          feedbackContext: feedback
        });

        const saved = saveSchedule(data, feedback.user_id, sourceDailyLog.log_id, draft, 'rescheduled');
        updated_schedule = saved.schedule;
        updated_items = saved.items;
      }
    }

    await writeData(data);
    sendJson(res, 201, { feedback, updated_schedule, updated_items });
    return;
  }

  sendJson(res, 404, { error: 'Route not found.' });
}

function saveSchedule(data, userId, dailyLogId, draft, status) {
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
  data.schedules.push(schedule);
  data.schedule_items.push(...items);
  return { schedule, items };
}

function validateFixedTask(task) {
  if (!task.fixed_date) return 'Fixed-time tasks need a date.';
  if (!task.fixed_start_time || !task.fixed_end_time) return 'Fixed-time tasks need start and end times.';
  if (task.fixed_start_time >= task.fixed_end_time) return 'Fixed-time task end time must be after the start time.';
  return null;
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

async function serveStatic(pathname, res) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(clientDir, requested));
  if (!filePath.startsWith(clientDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(file);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
