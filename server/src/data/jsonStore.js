import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', '..', 'data');
const dataFile = path.join(dataDir, 'app-data.json');

const now = () => new Date().toISOString();

const defaultData = {
  users: [
    {
      user_id: 'user_demo',
      full_name: 'Sara Alhamede',
      email: 'sara@smart-planner.local',
      preferred_language: 'en',
      created_at: now()
    }
  ],
  user_preferences: [
    {
      preference_id: 'pref_demo',
      user_id: 'user_demo',
      wake_up_time: '07:00',
      sleep_time: '22:30',
      preferred_study_start: '09:00',
      preferred_study_end: '18:00',
      break_duration_minutes: 10,
      max_daily_tasks: 6,
      created_at: now(),
      updated_at: now()
    }
  ],
  daily_logs: [],
  tasks: [],
  schedules: [],
  schedule_items: [],
  feedback: []
};

async function readData() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify(defaultData, null, 2), 'utf8');
  }
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw);
}

async function writeData(data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

async function insert(collection, record) {
  const data = await readData();
  data[collection].push(record);
  await writeData(data);
  return record;
}

export const jsonStore = {
  async getUser(userId) {
    const data = await readData();
    return data.users.find((item) => item.user_id === userId) || null;
  },

  async getUserPreferences(userId) {
    const data = await readData();
    return data.user_preferences.find((item) => item.user_id === userId) || null;
  },

  async listDailyLogs(userId) {
    const data = await readData();
    return data.daily_logs.filter((item) => item.user_id === userId);
  },

  async getDailyLog(logId) {
    const data = await readData();
    return data.daily_logs.find((item) => item.log_id === logId) || null;
  },

  async insertDailyLog(record) {
    return insert('daily_logs', record);
  },

  async listTasks(userId) {
    const data = await readData();
    return data.tasks.filter((item) => item.user_id === userId);
  },

  async getTask(taskId) {
    const data = await readData();
    return data.tasks.find((item) => item.task_id === taskId) || null;
  },

  async insertTask(record) {
    return insert('tasks', record);
  },

  async updateTask(taskId, updates) {
    const data = await readData();
    const task = data.tasks.find((item) => item.task_id === taskId);
    if (!task) return null;
    Object.assign(task, updates);
    await writeData(data);
    return task;
  },

  async listFixedTasks(userId, fixedDate) {
    const data = await readData();
    return data.tasks.filter((item) => (
      item.user_id === userId &&
      item.fixed_date === fixedDate &&
      item.is_fixed_time &&
      !item.is_completed
    ));
  },

  async listSchedules(userId) {
    const data = await readData();
    return data.schedules.filter((item) => item.user_id === userId);
  },

  async getSchedule(scheduleId) {
    const data = await readData();
    return data.schedules.find((item) => item.schedule_id === scheduleId) || null;
  },

  async listScheduleItems(scheduleId) {
    const data = await readData();
    return data.schedule_items.filter((item) => item.schedule_id === scheduleId);
  },

  async getScheduleItem(scheduleItemId) {
    const data = await readData();
    return data.schedule_items.find((item) => item.schedule_item_id === scheduleItemId) || null;
  },

  async insertScheduleWithItems(schedule, items) {
    const data = await readData();
    data.schedules.push(schedule);
    data.schedule_items.push(...items);
    await writeData(data);
    return { schedule, items };
  },

  async listFeedback(userId) {
    const data = await readData();
    return data.feedback.filter((item) => item.user_id === userId);
  },

  async insertFeedback(record) {
    return insert('feedback', record);
  }
};
