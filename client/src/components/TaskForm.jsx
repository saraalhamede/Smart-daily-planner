import { useEffect, useState } from 'react';

const initialState = {
  title: '',
  description: '',
  estimated_duration_minutes: 30,
  category: '',
  priority_level: 3,
  difficulty_level: '',
  deadline: '',
  is_fixed_time: false,
  fixed_date: '',
  fixed_start_time: '',
  fixed_end_time: ''
};

export function TaskForm({ onSubmit, selectedDate, onDraftChange }) {
  const [form, setForm] = useState(() => buildInitialState(selectedDate));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const next = buildInitialState(selectedDate);
    setForm(next);
    onDraftChange?.(next);
  }, [selectedDate]);

  function updateForm(updates) {
    const next = { ...form, ...updates };
    setForm(next);
    onDraftChange?.(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit(normalizeTaskPayload(form, selectedDate));
      const next = buildInitialState(selectedDate);
      setForm(next);
      onDraftChange?.(next);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>Add task</h2>
        </div>
        <span className="soft-pill">{form.is_fixed_time ? 'Fixed' : 'Flexible'}</span>
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          Title
          <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} required />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />
        </label>

        <div className="field-grid two">
          <label>
            Estimated minutes
            <input
              type="number"
              min="15"
              step="15"
              value={form.estimated_duration_minutes}
              onChange={(event) => updateForm({ estimated_duration_minutes: event.target.value })}
            />
          </label>
          <label>
            Category
            <select value={form.category} onChange={(event) => updateForm({ category: event.target.value })}>
              <option value="">Auto</option>
              <option value="study">Study</option>
              <option value="coding">Coding</option>
              <option value="writing">Writing</option>
              <option value="routine">Routine</option>
            </select>
          </label>
        </div>

        <div className="field-grid two">
          <label>
            Priority
            <select value={form.priority_level} onChange={(event) => updateForm({ priority_level: event.target.value })}>
              <option value="5">Very high</option>
              <option value="4">High</option>
              <option value="3">Medium</option>
              <option value="2">Low</option>
              <option value="1">Very low</option>
            </select>
          </label>
          <label>
            Difficulty
            <select value={form.difficulty_level} onChange={(event) => updateForm({ difficulty_level: event.target.value })}>
              <option value="">Auto</option>
              <option value="5">Very hard</option>
              <option value="4">Hard</option>
              <option value="3">Medium</option>
              <option value="2">Easy</option>
              <option value="1">Very easy</option>
            </select>
          </label>
        </div>

        <label>
          Deadline
          <input type="datetime-local" value={form.deadline} onChange={(event) => updateForm({ deadline: event.target.value })} />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_fixed_time}
            onChange={(event) => updateForm({ is_fixed_time: event.target.checked })}
          />
          This is a fixed-time task
        </label>

        {form.is_fixed_time ? (
          <div className="field-grid">
            {selectedDate ? (
              <div className="fixed-date-note">
                <strong>Fixed date</strong>
                <span>{formatSelectedDate(selectedDate)}</span>
              </div>
            ) : (
              <label>
                Fixed date
                <input type="date" value={form.fixed_date} onChange={(event) => updateForm({ fixed_date: event.target.value })} />
              </label>
            )}
            <label>
              Start
              <input type="time" value={form.fixed_start_time} onChange={(event) => updateForm({ fixed_start_time: event.target.value })} />
            </label>
            <label>
              End
              <input type="time" value={form.fixed_end_time} onChange={(event) => updateForm({ fixed_end_time: event.target.value })} />
            </label>
          </div>
        ) : null}

        <button className="primary-action" type="submit" disabled={isSaving}>
          {isSaving ? 'Adding...' : 'Add Task'}
        </button>
      </form>
    </section>
  );
}

function buildInitialState(selectedDate) {
  return {
    ...initialState,
    fixed_date: selectedDate || ''
  };
}

function normalizeTaskPayload(form, selectedDate) {
  const payload = {
    ...form,
    task_date: selectedDate || form.fixed_date || ''
  };

  if (form.is_fixed_time && selectedDate) {
    payload.fixed_date = selectedDate;
  }

  return payload;
}

function formatSelectedDate(value) {
  if (!value) return '';
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}
