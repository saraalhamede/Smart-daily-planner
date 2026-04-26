import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');
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

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function readData() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify(defaultData, null, 2), 'utf8');
  }
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw);
}

export async function writeData(data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

export function latestRecord(records, field = 'created_at') {
  return [...records].sort((a, b) => new Date(b[field]) - new Date(a[field]))[0] || null;
}
