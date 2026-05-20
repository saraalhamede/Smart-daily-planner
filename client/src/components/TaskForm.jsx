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

export function TaskForm({
  onSubmit,
  selectedDate,
  onDraftChange,
  initialValue,
  submitLabel = 'Add Task',
  savingLabel = 'Adding...',
  requireCompleteTask = false,
  onCancelEdit,
  afterForm
}) {
  const [form, setForm] = useState(() => buildInitialState(selectedDate));
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    const next = {
      ...buildInitialState(selectedDate),
      ...(initialValue || {})
    };
    setForm(next);
    onDraftChange?.(next);
    setValidationMessage('');
  }, [selectedDate, initialValue]);

  function updateForm(updates) {
    const next = { ...form, ...updates };
    setForm(next);
    onDraftChange?.(next);
    if (validationMessage) {
      setValidationMessage('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = normalizeTaskPayload(form, selectedDate);
    const validation = requireCompleteTask ? validateTaskPayload(payload, selectedDate) : { isValid: true, message: '' };
    if (!validation.isValid) {
      setValidationMessage(validation.message);
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit(payload);
      const next = buildInitialState(selectedDate);
      setForm(next);
      onDraftChange?.(next);
      setValidationMessage('');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>{initialValue ? 'Edit task' : 'Add task'}</h2>
        </div>
        <span className="soft-pill">{form.is_fixed_time ? 'Fixed' : 'Flexible'}</span>
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        {validationMessage ? <p className="form-validation">{validationMessage}</p> : null}

        <label>
          Title
          <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} required={!requireCompleteTask} />
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

        <div className="button-row">
          <button type="submit" disabled={isSaving}>
            {isSaving ? savingLabel : submitLabel}
          </button>
          {initialValue && onCancelEdit ? (
            <button className="secondary" type="button" onClick={onCancelEdit}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {afterForm ? <div className="task-form-extra">{afterForm}</div> : null}
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

function validateTaskPayload(payload, selectedDate) {
  if (!payload.title?.trim()) {
    return { isValid: false, message: 'Task title is required.' };
  }

  const duration = Number.parseInt(payload.estimated_duration_minutes, 10);
  if (Number.isNaN(duration) || duration < 15) {
    return { isValid: false, message: 'Estimated duration is required and must be at least 15 minutes.' };
  }

  if (!payload.priority_level) {
    return { isValid: false, message: 'Priority is required.' };
  }

  if (!payload.difficulty_level) {
    return { isValid: false, message: 'Difficulty is required.' };
  }

  if (typeof payload.is_fixed_time !== 'boolean') {
    return { isValid: false, message: 'Task type is required.' };
  }

  if (payload.is_fixed_time) {
    if (!selectedDate && !payload.fixed_date) {
      return { isValid: false, message: 'Fixed date is required for fixed-time tasks.' };
    }
    if (!payload.fixed_start_time || !payload.fixed_end_time) {
      return { isValid: false, message: 'Start time and end time are required for fixed-time tasks.' };
    }
    if (payload.fixed_start_time >= payload.fixed_end_time) {
      return { isValid: false, message: 'Fixed-time task end time must be after the start time.' };
    }
  }

  return { isValid: true, message: '' };
}

function formatSelectedDate(value) {
  if (!value) return '';
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}
