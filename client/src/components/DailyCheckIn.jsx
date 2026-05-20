import { useEffect, useState } from 'react';

const initialState = {
  mood_text_original: '',
  mood_level: 3,
  energy_level: 3,
  stress_level: 3,
  sleep_hours: 7,
  is_tired: false,
  planning_start: '',
  planning_end: ''
};

export function DailyCheckIn({ onSubmit, latestLog, selectedDate, onDraftChange }) {
  const [form, setForm] = useState(initialState);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(initialState);
    onDraftChange?.(initialState);
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
      const payload = selectedDate ? { ...form, log_date: selectedDate } : form;
      const result = await onSubmit(payload);
      return result;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Daily Check-In</p>
          <h2>How are you feeling?</h2>
        </div>
        {latestLog ? <span className="soft-pill">Energy {latestLog.predicted_energy_level}/5</span> : null}
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          Mood note
          <textarea
            value={form.mood_text_original}
            onChange={(event) => updateForm({ mood_text_original: event.target.value })}
            placeholder="Share your mood, energy level, or any challenges..."
          />
        </label>

        <div className="metric-grid">
          <RangeField label="Mood" value={form.mood_level} onChange={(value) => updateForm({ mood_level: value })} />
          <RangeField label="Energy" value={form.energy_level} onChange={(value) => updateForm({ energy_level: value })} />
          <RangeField label="Stress" value={form.stress_level} onChange={(value) => updateForm({ stress_level: value })} />
          <label>
            Sleep hours
            <input
              type="number"
              min="0"
              max="14"
              step="0.5"
              value={form.sleep_hours}
              onChange={(event) => updateForm({ sleep_hours: event.target.value })}
            />
          </label>
        </div>

        <div className="field-grid">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_tired}
              onChange={(event) => updateForm({ is_tired: event.target.checked })}
            />
            I feel tired today
          </label>
          <label>
            Planning start
            <input type="time" value={form.planning_start} onChange={(event) => updateForm({ planning_start: event.target.value })} />
          </label>
          <label>
            Planning end
            <input type="time" value={form.planning_end} onChange={(event) => updateForm({ planning_end: event.target.value })} />
          </label>
        </div>

        <button className="primary-action" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Check-In'}
        </button>
      </form>
    </section>
  );
}

function RangeField({ label, value, onChange }) {
  return (
    <label>
      <span className="range-label">
        {label}
        <strong>{value}/5</strong>
      </span>
      <input type="range" min="1" max="5" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
