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
  const requestedPlanningStart = rescheduleFrom
    ? new Date(rescheduleFrom)
    : combineDateAndTime(
        targetDate,
        dailyLog?.planning_start || preferences?.wake_up_time || preferences?.preferred_study_start || '07:00'
      );
  const planningEnd = combineDateAndTime(
    targetDate,
    dailyLog?.planning_end || preferences?.sleep_time || preferences?.preferred_study_end || '22:30'
  );
  const planningStart = getEffectivePlanningStart(targetDate, requestedPlanningStart, planningEnd);
  const basePredictedEnergy = dailyLog?.predicted_energy_level || dailyLog?.energy_level || 3;
  const rescheduleEnergy = adjustEnergyFromFeedback(basePredictedEnergy, feedbackContext);
  const userState = buildUserState(dailyLog, rescheduleEnergy, feedbackContext);
  const preferredBreakMinutes = clamp(Number.parseInt(preferences?.break_duration_minutes || 10, 10) || 10, 5, 30);

  const fixedTasks = tasks
    .filter((task) => (
      !task.is_completed &&
      task.status !== 'completed' &&
      task.is_fixed_time &&
      dateOnly(task.fixed_date) === targetDate
    ))
    .map((task) => normalizeFixedTask(task, targetDate, planningStart))
    .filter((task) => new Date(task.start_time) >= planningStart && new Date(task.end_time) > planningStart)
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

  const workState = createWorkState();

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
        recordWorkBlock(workState, task, blockMinutes);

        const remainingWorkExists = task.remaining_minutes > 0 ||
          flexibleTasks.some((nextTask) => nextTask.task_id !== task.task_id && nextTask.remaining_minutes > 0);
        const nextTask = findNextFlexibleTask(flexibleTasks, task.task_id);
        const breakMinutes = chooseBreakMinutes(preferredBreakMinutes, {
          userState,
          feedbackContext,
          task,
          blockMinutes,
          workState,
          nextTask
        });
        const breakEnd = addMinutes(end, breakMinutes);
        if (shouldAddBreakAfterTask({
          remainingWorkExists,
          breakEnd,
          segmentEnd: segment.end,
          userState,
          feedbackContext,
          task,
          blockMinutes,
          workState,
          nextTask
        })) {
          const suggestion = buildBreakSuggestion({
            userState,
            feedbackContext,
            task,
            blockMinutes,
            workState,
            nextTask
          });
          items.push({
            task_id: null,
            title: 'Break Time',
            category: 'break',
            difficulty_level: null,
            start_time: end.toISOString(),
            end_time: breakEnd.toISOString(),
            energy_slot: 'break',
            task_kind: 'break',
            priority_level: null,
            reason: suggestion
          });
          cursor = breakEnd;
          resetWorkAfterBreak(workState);
        } else {
          cursor = end;
        }
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
  return {
    ...task,
    ...enriched,
    start_time: originalStart.toISOString(),
    end_time: combineDateAndTime(targetDate, task.fixed_end_time).toISOString()
  };
}

function enrichFlexibleTask(task, feedback) {
  const enriched = categorizeTask(task);
  const history = feedback.filter((item) => item.task_id === task.task_id);
  const missedBefore = history.some((item) => !item.completed);
  const hardBefore = history.some((item) => Number.parseInt(item.difficulty_feedback, 10) >= 4);
  const overranBefore = history.some((item) => {
    const actual = Number.parseInt(item.actual_duration_minutes, 10);
    const planned = Number.parseInt(task.estimated_duration_minutes || enriched.estimated_duration_minutes, 10);
    return actual > 0 && planned > 0 && actual > planned * 1.25;
  });
  const positiveBefore = history.some((item) => {
    const energyAfter = Number.parseInt(item.energy_after, 10);
    const difficultyFeedback = Number.parseInt(item.difficulty_feedback, 10);
    return Boolean(item.completed) &&
      (!Number.isNaN(energyAfter) && energyAfter >= 4) &&
      (Number.isNaN(difficultyFeedback) || difficultyFeedback <= 2);
  });
  const remaining = Number.parseInt(task.remaining_duration_minutes, 10) || enriched.estimated_duration_minutes;

  return {
    ...task,
    ...enriched,
    remaining_minutes: remaining,
    urgency_score: deadlineUrgency(task.deadline),
    feedback_penalty: missedBefore ? 4 : 0,
    feedback_hardness: hardBefore ? 1 : 0,
    feedback_overrun: overranBefore ? 1 : 0,
    feedback_positive: positiveBefore ? 1 : 0
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
  if (energy <= 2 && difficulty >= 3 && priority <= 3) energyFit -= 4;
  if (task.feedback_positive && energy >= 3) energyFit += 2;
  return priority * 10 +
    task.urgency_score +
    energyFit -
    task.feedback_penalty -
    task.feedback_hardness -
    (task.feedback_overrun ? 2 : 0);
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
  if (task.status === 'in_progress') return false;
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

function getEffectivePlanningStart(targetDate, requestedStart, planningEnd) {
  const today = dateOnly(new Date());
  if (targetDate !== today) return requestedStart;
  const now = new Date();
  if (now >= planningEnd) return planningEnd;
  return now > requestedStart ? now : requestedStart;
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

function buildUserState(dailyLog, energy, feedbackContext) {
  const stress = Number.parseInt(dailyLog?.stress_level, 10);
  const mood = Number.parseInt(dailyLog?.mood_level, 10);
  const sleepHours = Number.parseFloat(dailyLog?.sleep_hours);
  const state = {
    energy: clamp(Number.parseInt(energy, 10) || 3, 1, 5),
    stress: Number.isNaN(stress) ? 3 : stress,
    mood: Number.isNaN(mood) ? 3 : mood,
    sleepHours: Number.isNaN(sleepHours) ? 7 : sleepHours,
    isTired: parseBoolean(dailyLog?.is_tired)
  };
  state.needsRecovery = state.energy <= 2 ||
    state.stress >= 4 ||
    state.sleepHours < 6 ||
    state.isTired ||
    hasRecoveryFeedback(feedbackContext);
  state.strongStart = state.energy >= 4 &&
    state.stress <= 2 &&
    state.sleepHours >= 7 &&
    !state.isTired &&
    state.mood >= 3;
  return state;
}

function createWorkState() {
  return {
    totalBlocks: 0,
    minutesSinceBreak: 0,
    blocksSinceBreak: 0,
    distinctTasksSinceBreak: 0,
    taskIdsSinceBreak: new Set()
  };
}

function recordWorkBlock(workState, task, blockMinutes) {
  workState.totalBlocks += 1;
  workState.minutesSinceBreak += blockMinutes;
  workState.blocksSinceBreak += 1;
  if (task.task_id && !workState.taskIdsSinceBreak.has(task.task_id)) {
    workState.taskIdsSinceBreak.add(task.task_id);
    workState.distinctTasksSinceBreak = workState.taskIdsSinceBreak.size;
  }
}

function resetWorkAfterBreak(workState) {
  workState.minutesSinceBreak = 0;
  workState.blocksSinceBreak = 0;
  workState.distinctTasksSinceBreak = 0;
  workState.taskIdsSinceBreak.clear();
}

function findNextFlexibleTask(tasks, currentTaskId) {
  return tasks.find((task) => task.task_id !== currentTaskId && task.remaining_minutes > 0) ||
    tasks.find((task) => task.remaining_minutes > 0) ||
    null;
}

function shouldAddBreakAfterTask({
  remainingWorkExists,
  breakEnd,
  segmentEnd,
  userState,
  feedbackContext,
  task,
  blockMinutes,
  workState,
  nextTask
}) {
  if (!remainingWorkExists) return false;
  if (breakEnd > segmentEnd) return false;
  if (Math.floor((segmentEnd - breakEnd) / 60000) < 15) return false;

  const difficulty = Number.parseInt(task.difficulty_level, 10) || 3;
  const nextDifficulty = Number.parseInt(nextTask?.difficulty_level, 10) || 0;
  const firstLightBlock = workState.totalBlocks === 1 && blockMinutes < 75 && difficulty <= 3;

  if (firstLightBlock && userState.strongStart && !hasRecoveryFeedback(feedbackContext)) {
    return false;
  }
  if (blockMinutes >= 75) return true;
  if (difficulty >= 4) return true;
  if (workState.minutesSinceBreak >= (userState.needsRecovery ? 55 : 100)) return true;
  if (workState.distinctTasksSinceBreak >= 2 && workState.minutesSinceBreak >= 45) return true;
  if (nextDifficulty >= 4 && (userState.needsRecovery || workState.minutesSinceBreak >= 60)) return true;
  if (hasRecoveryFeedback(feedbackContext) && workState.minutesSinceBreak >= 25) return true;
  if ((userState.energy <= 2 || userState.stress >= 4 || userState.isTired) && workState.minutesSinceBreak >= 30) return true;
  return false;
}

function chooseBreakMinutes(defaultBreak, context = {}) {
  const { userState, feedbackContext, task, blockMinutes, workState, nextTask } = context;
  let minutes = defaultBreak;
  const difficulty = Number.parseInt(task?.difficulty_level, 10) || 3;
  const nextDifficulty = Number.parseInt(nextTask?.difficulty_level, 10) || 0;

  if (workState?.minutesSinceBreak >= 120 || blockMinutes >= 90) {
    minutes += 10;
  } else if (difficulty >= 4 || nextDifficulty >= 4 || userState?.needsRecovery || hasRecoveryFeedback(feedbackContext)) {
    minutes += 5;
  }

  return clamp(minutes, 5, 30);
}

function buildBreakSuggestion({ userState, feedbackContext, task, blockMinutes, workState, nextTask }) {
  const difficulty = Number.parseInt(task?.difficulty_level, 10) || 3;
  const nextDifficulty = Number.parseInt(nextTask?.difficulty_level, 10) || 0;
  const seed = `${task?.task_id || task?.title || 'break'}:${workState?.totalBlocks || 0}:${workState?.minutesSinceBreak || 0}`;
  let suggestion = '';

  if (hasRecoveryFeedback(feedbackContext)) {
    suggestion = chooseSuggestion([
      'Take a recovery break before more hard work',
      'Relax for a few minutes before the next step',
      'Use this break to lower the pace a little'
    ], seed);
  } else if (userState?.stress >= 4) {
    suggestion = chooseSuggestion([
      'Short breathing reset before the next task',
      'Stretch your shoulders and take a screen break',
      'Drink water and reset your breathing'
    ], seed);
  } else if (userState?.energy <= 2 || userState?.isTired) {
    suggestion = chooseSuggestion([
      'Drink water and take a screen break',
      'Eat something light if you need fuel',
      'Rest your eyes before continuing'
    ], seed);
  } else if (difficulty >= 4) {
    suggestion = chooseSuggestion([
      'Relax before the next hard task',
      'Take a screen break after that hard block',
      'Reset before continuing with difficult work'
    ], seed);
  } else if (blockMinutes >= 75 || workState?.minutesSinceBreak >= 100) {
    suggestion = chooseSuggestion([
      'Stretch for a few minutes',
      'Walk around briefly',
      'Get water and loosen up'
    ], seed);
  } else if (nextDifficulty >= 4) {
    suggestion = chooseSuggestion([
      'Prepare calmly for the next difficult task',
      'Clear your workspace before the hard task',
      'Take a quiet reset before the next hard block'
    ], seed);
  } else {
    const options = [
      'Drink water',
      'Take a coffee break',
      'Eat something light',
      'Take a screen break',
      'Prepare for the next task'
    ];
    suggestion = options[hashString(String(task?.task_id || task?.title || 'break')) % options.length];
  }

  return `Suggested: ${suggestion}.`;
}

function chooseSuggestion(options, seed) {
  return options[hashString(seed) % options.length];
}

function hasRecoveryFeedback(feedbackContext) {
  if (!feedbackContext) return false;
  const energyAfter = Number.parseInt(feedbackContext.energy_after, 10);
  const moodAfter = Number.parseInt(feedbackContext.mood_after, 10);
  const difficultyFeedback = Number.parseInt(feedbackContext.difficulty_feedback, 10);
  return !feedbackContext.completed ||
    (!Number.isNaN(energyAfter) && energyAfter <= 2) ||
    (!Number.isNaN(moodAfter) && moodAfter <= 2) ||
    (!Number.isNaN(difficultyFeedback) && difficultyFeedback >= 4);
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
  const normalizedTime = String(time || '00:00').slice(0, 5);
  return new Date(`${date}T${normalizedTime}:00`);
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
