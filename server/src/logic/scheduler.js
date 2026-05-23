import { categorizeTask } from './ai.js';

export function generateDailySchedule({
  userId,
  dailyLog,
  preferences,
  tasks,
  feedback,
  scheduleDate,
  rescheduleFrom,
  feedbackContext
}) {
  const targetDate = scheduleDate || dailyLog?.log_date || new Date().toISOString().slice(0, 10);
  const planningStart = rescheduleFrom
    ? new Date(rescheduleFrom)
    : combineDateAndTime(
        targetDate,
        dailyLog?.planning_start || preferences?.wake_up_time || preferences?.preferred_study_start || '07:00'
      );
  const planningEnd = combineDateAndTime(
    targetDate,
    dailyLog?.planning_end || preferences?.sleep_time || preferences?.preferred_study_end || '22:30'
  );
  const basePredictedEnergy = dailyLog?.predicted_energy_level || dailyLog?.energy_level || 3;
  const rescheduleEnergy = adjustEnergyFromFeedback(basePredictedEnergy, feedbackContext);
  const breakMinutes = chooseBreakMinutes(preferences?.break_duration_minutes || 10, feedbackContext);

  const fixedTasks = tasks
    .filter((task) => (
      !task.is_completed &&
      task.status !== 'completed' &&
      task.is_fixed_time &&
      dateOnly(task.fixed_date) === targetDate
    ))
    .map((task) => normalizeFixedTask(task, targetDate, planningStart))
    .filter((task) => new Date(task.end_time) > planningStart)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const freeSegments = buildFreeSegments(
    planningStart,
    planningEnd,
    fixedTasks.map((task) => ({ start: new Date(task.start_time), end: new Date(task.end_time) }))
  );

  const flexibleTasks = tasks
    .filter((task) => {
      return !task.is_completed &&
        task.status !== 'completed' &&
        task.status !== 'removed' &&
        task.status !== 'deleted' &&
        !task.is_fixed_time &&
        shouldTaskAppearOnDate(task, targetDate);
    })
    .map((task) => enrichFlexibleTask(task, feedback))
    .sort((a, b) => scoreTask(b, rescheduleEnergy) - scoreTask(a, rescheduleEnergy));

  const items = fixedTasks.map((task) => ({
    task_id: task.task_id,
    title: task.title,
    category: task.category,
    difficulty_level: task.difficulty_level,
    start_time: task.start_time,
    end_time: task.end_time,
    energy_slot: 'fixed',
    task_kind: 'fixed',
    priority_level: task.priority_level,
    reason: 'Fixed-time task reserved by the user.'
  }));

  for (const segment of freeSegments) {
    let cursor = new Date(segment.start);
    for (const task of flexibleTasks) {
      if (task.remaining_minutes <= 0) continue;
      while (task.remaining_minutes > 0 && cursor < segment.end) {
        const availableMinutes = Math.floor((segment.end - cursor) / 60000);
        const blockMinutes = Math.min(chooseSessionLength(task, rescheduleEnergy), task.remaining_minutes, availableMinutes);
        if (blockMinutes < 15) break;

        const start = new Date(cursor);
        const end = addMinutes(start, blockMinutes);
        items.push({
          task_id: task.task_id,
          title: task.title,
          category: task.category,
          difficulty_level: task.difficulty_level,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          energy_slot: energyLabel(rescheduleEnergy),
          task_kind: 'flexible',
          priority_level: task.priority_level,
          reason: buildReason(task, rescheduleEnergy, feedbackContext)
        });
        task.remaining_minutes -= blockMinutes;
        cursor = addMinutes(end, breakMinutes);
      }
    }
  }

  items.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  return {
    user_id: userId,
    schedule_date: targetDate,
    schedule_note: buildNote(rescheduleEnergy, rescheduleFrom, fixedTasks.length, items.length),
    items
  };
}

function normalizeFixedTask(task, targetDate, planningStart) {
  const enriched = categorizeTask(task);
  const originalStart = combineDateAndTime(targetDate, task.fixed_start_time);
  const start = originalStart < planningStart ? new Date(planningStart) : originalStart;
  return {
    ...task,
    ...enriched,
    start_time: start.toISOString(),
    end_time: combineDateAndTime(targetDate, task.fixed_end_time).toISOString()
  };
}

function enrichFlexibleTask(task, feedback) {
  const enriched = categorizeTask(task);
  const history = feedback.filter((item) => item.task_id === task.task_id);
  const missedBefore = history.some((item) => !item.completed);
  const hardBefore = history.some((item) => Number.parseInt(item.difficulty_feedback, 10) >= 4);
  const remaining = Number.parseInt(task.remaining_duration_minutes, 10) || enriched.estimated_duration_minutes;

  return {
    ...task,
    ...enriched,
    remaining_minutes: remaining,
    urgency_score: deadlineUrgency(task.deadline),
    feedback_penalty: missedBefore ? 4 : 0,
    feedback_hardness: hardBefore ? 1 : 0
  };
}

function buildFreeSegments(start, end, blocked) {
  if (start >= end) return [];
  if (blocked.length === 0) return [{ start, end }];

  const merged = mergeIntervals(blocked.filter((block) => block.end > start && block.start < end));
  const free = [];
  let cursor = new Date(start);

  for (const block of merged) {
    if (block.start > cursor) {
      free.push({ start: new Date(cursor), end: new Date(block.start) });
    }
    if (block.end > cursor) {
      cursor = new Date(block.end);
    }
  }

  if (cursor < end) {
    free.push({ start: cursor, end });
  }

  return free.filter((segment) => segment.end > segment.start);
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ start: new Date(interval.start), end: new Date(interval.end) });
      continue;
    }
    if (interval.end > last.end) {
      last.end = new Date(interval.end);
    }
  }
  return merged;
}

function scoreTask(task, energy) {
  const priority = Number.parseInt(task.priority_level, 10) || 3;
  const difficulty = Number.parseInt(task.difficulty_level, 10) || 3;
  let energyFit = 8;
  if (energy >= 4 && difficulty >= 4) energyFit = 16;
  if (energy <= 2 && difficulty <= 2) energyFit = 14;
  if (energy <= 2 && difficulty >= 4) energyFit = task.urgency_score >= 30 ? 1 : -12;
  return priority * 10 + task.urgency_score + energyFit - task.feedback_penalty - task.feedback_hardness;
}

function chooseSessionLength(task, energy) {
  if (energy <= 2 && task.difficulty_level >= 4) return 30;
  if (energy <= 2 && task.difficulty_level === 3) return 45;
  if (task.difficulty_level >= 4) return 90;
  if (task.difficulty_level <= 2) return 30;
  return 60;
}

function deadlineUrgency(deadline) {
  if (!deadline) return 0;
  const diffHours = Math.round((new Date(deadline) - new Date()) / 3600000);
  if (diffHours <= 0) return 45;
  if (diffHours <= 24) return 35;
  if (diffHours <= 72) return 20;
  return 6;
}

function shouldTaskAppearOnDate(task, targetDate) {
  const taskDate = dateOnly(task.task_date);
  const startDate = taskDate || dateOnly(task.created_at);
  const deadlineDate = dateOnly(task.deadline);

  if (!deadlineDate) {
    return !startDate || startDate === targetDate;
  }

  if (startDate && targetDate < startDate) {
    return false;
  }

  return true;
}

function adjustEnergyFromFeedback(baseEnergy, feedbackContext) {
  if (!feedbackContext) return baseEnergy;
  let energy = feedbackContext.energy_after ? Number.parseInt(feedbackContext.energy_after, 10) : baseEnergy;
  const moodAfter = Number.parseInt(feedbackContext.mood_after, 10);
  const difficultyFeedback = Number.parseInt(feedbackContext.difficulty_feedback, 10);

  if (!feedbackContext.completed) energy -= 1;
  if (!Number.isNaN(moodAfter) && moodAfter <= 2) energy -= 1;
  if (!Number.isNaN(moodAfter) && moodAfter >= 4) energy += 1;
  if (!Number.isNaN(difficultyFeedback) && difficultyFeedback >= 4) energy -= 1;
  return clamp(energy, 1, 5);
}

function chooseBreakMinutes(defaultBreak, feedbackContext) {
  if (!feedbackContext) return defaultBreak;
  const energyAfter = Number.parseInt(feedbackContext.energy_after, 10);
  if (!Number.isNaN(energyAfter) && energyAfter <= 2) return defaultBreak + 5;
  return defaultBreak;
}

function buildReason(task, energy, feedbackContext) {
  if (feedbackContext && !feedbackContext.completed && energy <= 2 && task.difficulty_level <= 2) {
    return 'After low-energy feedback, an easier task was moved earlier.';
  }
  if (feedbackContext && !feedbackContext.completed && energy <= 2 && task.difficulty_level >= 4) {
    return 'After difficult feedback, this hard task stayed in a shorter block.';
  }
  if (energy <= 2 && task.difficulty_level <= 2) {
    return 'Placed in a low-energy gap because this task is easier.';
  }
  if (task.urgency_score >= 30) {
    return 'Moved earlier because the deadline is close.';
  }
  return 'Placed in a free gap based on priority, difficulty, and remaining time.';
}

function buildNote(energy, rescheduleFrom, fixedCount, totalCount) {
  if (totalCount === 0) return 'No schedule could be generated for the remaining time.';
  if (rescheduleFrom) {
    return `Schedule refreshed after feedback. Remaining tasks were re-planned using the updated state (energy ${energy}/5).`;
  }
  if (fixedCount > 0) {
    return 'Fixed-time tasks were reserved first, then flexible tasks were placed around them.';
  }
  if (energy <= 2) {
    return 'Low-energy schedule with shorter blocks and easier tasks first.';
  }
  return 'Balanced daily schedule generated from priorities, deadlines, and energy.';
}

function energyLabel(value) {
  if (value >= 4) return 'high';
  if (value <= 2) return 'low';
  return 'medium';
}

function combineDateAndTime(date, time) {
  return new Date(`${date}T${time}:00`);
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
