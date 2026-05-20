const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const plannerApi = {
  bootstrap(userId) {
    return request(`/api/bootstrap?userId=${userId}`);
  },
  createDailyLog(payload) {
    return request('/api/daily-logs', {
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
  getTasks(userId) {
    return request(`/api/tasks?userId=${userId}`);
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
  }
};
