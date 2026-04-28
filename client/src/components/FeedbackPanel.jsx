import { useState } from 'react';

const initialState = {
  actual_duration_minutes: '',
  difficulty_feedback: '',
  energy_after: '',
  mood_after: '',
  comment: ''
};

export function FeedbackPanel({ item, onSubmit }) {
  const [form, setForm] = useState(initialState);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(completed) {
    setIsSaving(true);
    try {
      await onSubmit({
        ...form,
        completed,
        task_id: item.task_id,
        schedule_item_id: item.schedule_item_id
      });
      setForm(initialState);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="feedback-box">
      <div className="feedback-grid">
        <label>
          Actual minutes
          <input
            type="number"
            min="0"
            step="5"
            value={form.actual_duration_minutes}
            onChange={(event) => setForm({ ...form, actual_duration_minutes: event.target.value })}
          />
        </label>
        <SelectScore label="Difficulty" value={form.difficulty_feedback} onChange={(value) => setForm({ ...form, difficulty_feedback: value })} />
        <SelectScore label="Energy" value={form.energy_after} onChange={(value) => setForm({ ...form, energy_after: value })} />
        <SelectScore label="Mood" value={form.mood_after} onChange={(value) => setForm({ ...form, mood_after: value })} />
      </div>
      <label>
        Comment
        <textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
      </label>
      <div className="button-row">
        <button type="button" onClick={() => submit(true)} disabled={isSaving}>Completed</button>
        <button className="secondary" type="button" onClick={() => submit(false)} disabled={isSaving}>Not completed</button>
      </div>
    </div>
  );
}

function SelectScore({ label, value, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">-</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </label>
  );
}
