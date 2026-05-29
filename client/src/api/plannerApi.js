const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (error) {
    console.error(`[plannerApi] Network error for ${path}`, error);
    throw new Error(`Could not reach the planner API at ${API_BASE_URL}.`);
  }

  const data = await parseResponseBody(response);
  if (!response.ok) {
    console.error(`[plannerApi] Request failed for ${path}`, data);
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('[plannerApi] API returned non-JSON response', text);
    return { error: text };
  }
}

function encode(value) {
  return encodeURIComponent(value);
}

export const plannerApi = {
  register(payload) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  login(payload) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateUser(userId, payload) {
    return request(`/api/users/${encode(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  bootstrap(userId) {
    return request(`/api/bootstrap?userId=${encode(userId)}`);
  },
  getWeeklyDashboard(userId, date) {
    const query = date ? `&date=${encode(date)}` : '';
    return request(`/api/dashboard/week?userId=${encode(userId)}${query}`);
  },
  getCalendarMonth(userId, month, year) {
    return request(`/api/calendar/month?userId=${encode(userId)}&month=${encode(month)}&year=${encode(year)}`);
  },
  getDay(userId, date) {
    return request(`/api/day/${encode(date)}?userId=${encode(userId)}`);
  },
  getDailyCheckins(userId) {
    return request(`/api/daily-checkins?userId=${encode(userId)}`);
  },
  createDailyLog(payload) {
    return request('/api/checkins', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  createTask(payload) {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateTask(taskId, payload) {
    return request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  startTaskOnDate(taskId, payload) {
    return request(`/api/tasks/${encode(taskId)}/start`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  moveTaskToDate(taskId, payload) {
    return request(`/api/tasks/${encode(taskId)}/move-to-date`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  removeTask(taskId) {
    return request(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });
  },
  getTasks(userId) {
    return request(`/api/tasks?userId=${encode(userId)}`);
  },
  getSchedules(userId) {
    return request(`/api/schedules?userId=${encode(userId)}`);
  },
  getScheduleForDate(userId, date) {
    return request(`/api/schedules/${encode(date)}?userId=${encode(userId)}`);
  },
  getDailyDetails(userId, date) {
    return request(`/api/day/${encode(date)}/details?userId=${encode(userId)}`);
  },
  getFeedback(userId) {
    return request(`/api/feedback?userId=${encode(userId)}`);
  },
  getAiNotes(userId, period = 'weekly') {
    return request(`/api/ai-notes?userId=${encode(userId)}&period=${encode(period)}`);
  },
  getProgress(userId, period = 'weekly') {
    return request(`/api/progress?userId=${encode(userId)}&period=${encode(period)}`);
  },
  generateSchedule(input) {
    const payload = typeof input === 'string' ? { user_id: input } : input;
    return request('/api/schedules/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  submitFeedback(payload) {
    return request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateScheduleItemStatus(scheduleItemId, payload) {
    return request(`/api/schedule-items/${scheduleItemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },
  updateSubtask(subtaskId, payload) {
    return request(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },
  addResource(payload) {
    return request('/api/resources', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  deleteResource(resourceId) {
    return request(`/api/resources/${resourceId}`, {
      method: 'DELETE'
    });
  },
  savePreferences(userId, payload) {
    return request(`/api/settings/${encode(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  getPreferences(userId) {
    return request(`/api/settings/${encode(userId)}`);
  },
  getSettings(userId) {
    return request(`/api/settings/${encode(userId)}`);
  },
  saveSettings(userId, payload) {
    return request(`/api/settings/${encode(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }
};
