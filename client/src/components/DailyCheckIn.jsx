import { useState } from 'react';

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

export function DailyCheckIn({ onSubmit, latestLog }) {
  const [form, setForm] = useState(initialState);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit(form);
      setForm((current) => ({ ...current, mood_text_original: '' }));
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
            onChange={(event) => setForm({ ...form, mood_text_original: event.target.value })}
            placeholder="Share your mood, energy level, or any challenges..."
          />
        </label>

        <div className="metric-grid">
          <RangeField label="Mood" value={form.mood_level} onChange={(value) => setForm({ ...form, mood_level: value })} />
          <RangeField label="Energy" value={form.energy_level} onChange={(value) => setForm({ ...form, energy_level: value })} />
          <RangeField label="Stress" value={form.stress_level} onChange={(value) => setForm({ ...form, stress_level: value })} />
          <label>
            Sleep hours
            <input
              type="number"
              min="0"
              max="14"
              step="0.5"
              value={form.sleep_hours}
              onChange={(event) => setForm({ ...form, sleep_hours: event.target.value })}
            />
          </label>
        </div>

        <div className="field-grid">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_tired}
              onChange={(event) => setForm({ ...form, is_tired: event.target.checked })}
            />
            I feel tired today
          </label>
          <label>
            Planning start
            <input type="time" value={form.planning_start} onChange={(event) => setForm({ ...form, planning_start: event.target.value })} />
          </label>
          <label>
            Planning end
            <input type="time" value={form.planning_end} onChange={(event) => setForm({ ...form, planning_end: event.target.value })} />
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
