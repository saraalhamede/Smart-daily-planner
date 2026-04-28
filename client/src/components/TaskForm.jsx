import { useState } from 'react';

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

export function TaskForm({ onSubmit }) {
  const [form, setForm] = useState(initialState);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit(form);
      setForm(initialState);
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
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>

        <div className="field-grid two">
          <label>
            Estimated minutes
            <input
              type="number"
              min="15"
              step="15"
              value={form.estimated_duration_minutes}
              onChange={(event) => setForm({ ...form, estimated_duration_minutes: event.target.value })}
            />
          </label>
          <label>
            Category
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
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
            <select value={form.priority_level} onChange={(event) => setForm({ ...form, priority_level: event.target.value })}>
              <option value="5">Very high</option>
              <option value="4">High</option>
              <option value="3">Medium</option>
              <option value="2">Low</option>
              <option value="1">Very low</option>
            </select>
          </label>
          <label>
            Difficulty
            <select value={form.difficulty_level} onChange={(event) => setForm({ ...form, difficulty_level: event.target.value })}>
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
          <input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_fixed_time}
            onChange={(event) => setForm({ ...form, is_fixed_time: event.target.checked })}
          />
          This is a fixed-time task
        </label>

        {form.is_fixed_time ? (
          <div className="field-grid">
            <label>
              Fixed date
              <input type="date" value={form.fixed_date} onChange={(event) => setForm({ ...form, fixed_date: event.target.value })} />
            </label>
            <label>
              Start
              <input type="time" value={form.fixed_start_time} onChange={(event) => setForm({ ...form, fixed_start_time: event.target.value })} />
            </label>
            <label>
              End
              <input type="time" value={form.fixed_end_time} onChange={(event) => setForm({ ...form, fixed_end_time: event.target.value })} />
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
