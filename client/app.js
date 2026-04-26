const userId = 'user_demo';
const state = {
  tasks: [],
  scheduleItems: []
};

const menuButton = document.querySelector('#menuButton');
const sideMenu = document.querySelector('#sideMenu');
const overlay = document.querySelector('#overlay');
const fixedTaskToggle = document.querySelector('#fixedTaskToggle');
const fixedFields = document.querySelector('#fixedFields');
const dailyLogForm = document.querySelector('#dailyLogForm');
const taskForm = document.querySelector('#taskForm');
const dailyLogMessage = document.querySelector('#dailyLogMessage');
const taskMessage = document.querySelector('#taskMessage');
const taskList = document.querySelector('#taskList');
const scheduleList = document.querySelector('#scheduleList');
const scheduleNote = document.querySelector('#scheduleNote');
const generateScheduleButton = document.querySelector('#generateScheduleButton');

menuButton.addEventListener('click', () => {
  sideMenu.classList.add('open');
  overlay.classList.remove('hidden');
});

overlay.addEventListener('click', () => {
  sideMenu.classList.remove('open');
  overlay.classList.add('hidden');
});

fixedTaskToggle.addEventListener('change', () => {
  fixedFields.classList.toggle('hidden', !fixedTaskToggle.checked);
});

dailyLogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(dailyLogForm);
  const payload = Object.fromEntries(form.entries());
  payload.user_id = userId;
  payload.is_tired = form.has('is_tired');

  try {
    const response = await api('/api/daily-logs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const log = response.daily_log;
    dailyLogMessage.textContent = `Saved. Emotion: ${log.detected_emotion}, predicted energy: ${log.predicted_energy_level}/5. ${log.ai_advice}`;
  } catch (error) {
    dailyLogMessage.textContent = error.message;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(taskForm);
  const payload = Object.fromEntries(form.entries());
  payload.user_id = userId;
  payload.is_fixed_time = form.has('is_fixed_time');

  try {
    const response = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.tasks.unshift(response.task);
    taskMessage.textContent = payload.is_fixed_time
      ? 'Fixed-time task added. It will block that time in the schedule.'
      : 'Flexible task added. It will be placed in a free gap.';
    taskForm.reset();
    fixedFields.classList.add('hidden');
    renderTasks();
  } catch (error) {
    taskMessage.textContent = error.message;
  }
});

generateScheduleButton.addEventListener('click', async () => {
  try {
    const response = await api('/api/schedules/generate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
    state.scheduleItems = response.items;
    scheduleNote.textContent = response.schedule.schedule_note;
    await loadTasks();
    renderSchedule();
  } catch (error) {
    scheduleNote.textContent = error.message;
  }
});

await loadBootstrap();

async function loadBootstrap() {
  const data = await api(`/api/bootstrap?userId=${userId}`);
  state.tasks = data.tasks || [];
  state.scheduleItems = data.latest_schedule_items || [];
  if (data.latest_schedule?.schedule_note) {
    scheduleNote.textContent = data.latest_schedule.schedule_note;
  }
  renderTasks();
  renderSchedule();
}

async function loadTasks() {
  const data = await api(`/api/tasks?userId=${userId}`);
  state.tasks = data.tasks || [];
  renderTasks();
}

function renderTasks() {
  const openTasks = state.tasks.filter((task) => !task.is_completed);
  if (openTasks.length === 0) {
    taskList.innerHTML = '<p class="card-note">No active tasks yet.</p>';
    return;
  }

  taskList.innerHTML = openTasks.map((task) => `
    <article class="task-card ${task.is_fixed_time ? 'fixed' : 'flexible'}">
      <div class="card-title"><strong>${escapeHtml(task.title)}</strong></div>
      <div class="tag-row">
        <span class="tag">${task.is_fixed_time ? 'Fixed time' : 'Flexible'}</span>
        <span class="tag">Category: ${escapeHtml(task.category || 'general')}</span>
        <span class="tag">Priority: ${task.priority_level}/5</span>
        <span class="tag">Difficulty: ${task.difficulty_level}/5</span>
        <span class="tag">Remaining: ${task.remaining_duration_minutes} min</span>
        ${task.deadline ? `<span class="tag">Deadline: ${formatDateTime(task.deadline)}</span>` : ''}
        ${task.is_fixed_time ? `<span class="tag">When: ${escapeHtml(task.fixed_date)} ${escapeHtml(task.fixed_start_time)}-${escapeHtml(task.fixed_end_time)}</span>` : ''}
      </div>
      <div class="card-note">${escapeHtml(task.description || '')}</div>
    </article>
  `).join('');
}

function renderSchedule() {
  if (state.scheduleItems.length === 0) {
    scheduleList.innerHTML = '<p class="card-note">No schedule yet.</p>';
    return;
  }

  scheduleList.innerHTML = state.scheduleItems.map((item) => `
    <article class="schedule-card ${item.task_kind === 'fixed' ? 'fixed' : 'flexible'}" data-task-id="${item.task_id}" data-item-id="${item.schedule_item_id}">
      <div class="card-title"><strong>${formatTime(item.start_time)} - ${formatTime(item.end_time)} | ${escapeHtml(item.title)}</strong></div>
      <div class="tag-row">
        <span class="tag">${item.task_kind === 'fixed' ? 'Fixed time' : 'Flexible'}</span>
        <span class="tag">Energy: ${escapeHtml(item.energy_slot)}</span>
        <span class="tag">Category: ${escapeHtml(item.category || 'general')}</span>
        <span class="tag">Difficulty: ${item.difficulty_level}/5</span>
      </div>
      <div class="card-note">${escapeHtml(item.reason)}</div>
      ${item.task_kind === 'flexible' ? `
        <div class="feedback-panel">
          <div class="feedback-grid">
            <label>Actual minutes<input data-field="actual_duration_minutes" type="number" min="0" step="5" placeholder="e.g. 30"></label>
            <label>Difficulty after
              <select data-field="difficulty_feedback">
                <option value="">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <label>Energy after
              <select data-field="energy_after">
                <option value="">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <label>Mood after
              <select data-field="mood_after">
                <option value="">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
          </div>
          <label>Comment<textarea data-field="comment" rows="2" placeholder="Optional feedback comment"></textarea></label>
          <div class="feedback-actions">
            <button type="button" data-completed="true">Completed</button>
            <button type="button" class="secondary" data-completed="false">Not completed</button>
          </div>
        </div>
      ` : ''}
    </article>
  `).join('');

  scheduleList.querySelectorAll('.schedule-card [data-completed]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.schedule-card');
      const payload = {
        user_id: userId,
        task_id: card.dataset.taskId,
        schedule_item_id: card.dataset.itemId,
        completed: button.dataset.completed === 'true'
      };

      card.querySelectorAll('[data-field]').forEach((field) => {
        const value = field.value.trim();
        if (value) {
          payload[field.dataset.field] = value;
        }
      });

      try {
        const response = await api('/api/feedback', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (response.updated_schedule) {
          scheduleNote.textContent = response.updated_schedule.schedule_note;
          state.scheduleItems = response.updated_items || [];
        } else {
          scheduleNote.textContent = 'Feedback saved.';
        }
        await loadTasks();
        renderSchedule();
      } catch (error) {
        scheduleNote.textContent = error.message;
      }
    });
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
