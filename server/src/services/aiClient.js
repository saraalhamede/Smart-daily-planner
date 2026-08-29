import { analyzeMoodEnergy, categorizeTask } from '../logic/ai.js';
import { isValidatedOpenAiSubtaskResult } from './subtaskGenerationPolicy.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_TIMEOUT_MS = Number.parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '2500', 10);
const DEFAULT_GENERATIVE_SERVICE_TIMEOUT_MS = 7500;

export async function getAiServiceHealth() {
  try {
    return await callAiService('/ai/health', null, 'GET');
  } catch (error) {
    return {
      status: 'unavailable',
      service: 'smart-day-planner-ai',
      message: error.message
    };
  }
}

export async function analyzeMoodWithAi(payload) {
  try {
    return await callAiService('/ai/analyze-mood', payload);
  } catch (error) {
    console.warn('[AI] Mood analysis fallback used:', error.message);
    return fallbackMoodAnalysis(payload, error);
  }
}

export async function classifyTaskWithAi(payload) {
  try {
    return await callAiService('/ai/classify-task', payload);
  } catch (error) {
    console.warn('[AI] Task classification fallback used:', error.message);
    return fallbackTaskClassification(payload, error);
  }
}

export async function estimateTimeWithAi(payload) {
  try {
    return await callAiService('/ai/estimate-time', payload);
  } catch (error) {
    console.warn('[AI] Time estimation fallback used:', error.message);
    return fallbackTimeEstimation(payload, error);
  }
}

export async function generateScheduleHintsWithAi(payload) {
  try {
    return await callAiService('/ai/generate-schedule', payload);
  } catch (error) {
    console.warn('[AI] Scheduler hints fallback used:', error.message);
    return fallbackScheduleHints(payload, error);
  }
}

export async function generateSubtasksWithAi(payload) {
  try {
    const result = await callAiService('/ai/generate-subtasks', payload, 'POST', {
      timeoutMs: isGenerativeAiEnabled() ? getGenerativeServiceTimeoutMs() : AI_TIMEOUT_MS
    });
    if ((result?.source === 'openai_responses_api' ||
      result?.provenance === 'openai_responses_api' ||
      result?.generated_by_ai === true) &&
      !isValidatedOpenAiSubtaskResult(result)) {
      return fallbackSubtasks(payload, new Error('Invalid OpenAI subtask result.'));
    }
    return result;
  } catch (error) {
    console.warn('[AI] Subtask generation fallback used.');
    return fallbackSubtasks(payload, error);
  }
}

export async function generateAdviceWithAi(payload) {
  try {
    return await callAiService('/ai/generate-advice', payload);
  } catch (error) {
    console.warn('[AI] Advice generation fallback used:', error.message);
    return fallbackAdvice(payload, error);
  }
}

async function callAiService(path, payload, method = 'POST', options = {}) {
  if (process.env.AI_SERVICE_ENABLED === 'false') {
    throw new Error('AI service is disabled.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${AI_SERVICE_URL}${path}`, {
      method,
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `AI service returned ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackMoodAnalysis(payload, error) {
  const result = analyzeMoodEnergy(payload);
  return {
    module: 'mood_analysis',
    source: 'node_rule_based_fallback',
    model: 'local_rule_based',
    detected_language: result.detected_language,
    mood_text_translated: result.mood_text_translated,
    predicted_mood: result.detected_emotion,
    detected_emotion: result.detected_emotion,
    stress_estimation: parseInteger(payload.stress_level, 3),
    fatigue_detected: parseBoolean(payload.is_tired) || Number.parseFloat(payload.sleep_hours || 7) < 6,
    fatigue_score: parseBoolean(payload.is_tired) ? 2 : 0,
    predicted_energy_level: result.predicted_energy_level,
    energy_insights: result.ai_advice,
    ai_advice: result.ai_advice,
    confidence: 0.5,
    fallback_reason: error.message
  };
}

function fallbackTaskClassification(payload, error) {
  const result = categorizeTask(payload);
  return {
    module: 'task_classification',
    source: 'node_rule_based_fallback',
    model: 'local_rule_based',
    task_category: result.category,
    task_type: payload.is_fixed_time || payload.task_type === 'fixed' ? 'fixed' : 'flexible',
    confidence: 0.5,
    fallback_reason: error.message
  };
}

function fallbackTimeEstimation(payload, error) {
  const result = categorizeTask({
    ...payload,
    category: payload.task_category || payload.category
  });
  return {
    module: 'time_estimation',
    source: 'node_rule_based_fallback',
    model: 'local_rule_based',
    estimated_duration_minutes: result.estimated_duration_minutes,
    expected_workload: result.estimated_duration_minutes >= 90 ? 'heavy' : result.estimated_duration_minutes >= 45 ? 'medium' : 'light',
    confidence: 0.45,
    fallback_reason: error.message
  };
}

function fallbackScheduleHints(payload, error) {
  const checkin = payload.daily_checkin || payload.daily_log || payload;
  const stress = parseInteger(checkin.stress_level, 3);
  const energy = parseInteger(checkin.predicted_energy_level || checkin.energy_level, 3);
  const sleep = Number.parseFloat(checkin.sleep_hours || 7);
  const adjustedEnergy = Math.max(1, Math.min(5, energy - (stress >= 4 ? 1 : 0) - (sleep < 5 ? 1 : 0)));
  return {
    module: 'scheduler_hints',
    source: 'node_rule_based_fallback',
    model: 'local_rule_based',
    final_decision_owner: 'node_rule_based_scheduler',
    adjusted_energy_level: adjustedEnergy,
    avoid_high_difficulty: adjustedEnergy <= 2 || stress >= 4,
    recommended_break_minutes: adjustedEnergy <= 2 ? 15 : 10,
    recommendations: ['Use the Node rule-based scheduler with local fallback hints.'],
    confidence: 0.45,
    fallback_reason: error.message
  };
}

function fallbackSubtasks(payload, error) {
  if (isSimpleBreakdownPayload(payload)) {
    return {
      module: 'subtask_generation',
      source: 'node_rule_based_fallback',
      provenance: 'node_rule_based_fallback',
      model: 'local_ai_style_planner',
      generated_by_ai: false,
      fallback_used: true,
      fallback_reason_category: subtaskFallbackReasonCategory(error),
      subtasks: [],
      skipped: true,
      reason: 'simple_task',
      message: 'No breakdown needed for this simple task.',
      confidence: 0.45
    };
  }

  const fallbackPieces = buildFallbackSubtaskPlan(payload);
  return {
    module: 'subtask_generation',
    source: 'node_rule_based_fallback',
    provenance: 'node_rule_based_fallback',
    model: 'local_ai_style_planner',
    generated_by_ai: false,
    fallback_used: true,
    fallback_reason_category: subtaskFallbackReasonCategory(error),
    subtasks: fallbackPieces.map((title, index) => ({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      order_index: index + 1
    })),
    confidence: 0.45
  };
}

function isGenerativeAiEnabled() {
  return String(process.env.AI_GENERATIVE_ENABLED || '').trim().toLowerCase() === 'true';
}

function getGenerativeServiceTimeoutMs() {
  const configured = Number.parseInt(process.env.AI_GENERATIVE_SERVICE_TIMEOUT_MS || '', 10);
  return Number.isInteger(configured) && configured >= 3000 && configured <= 10000
    ? configured
    : DEFAULT_GENERATIVE_SERVICE_TIMEOUT_MS;
}

function subtaskFallbackReasonCategory(error) {
  return error?.name === 'AbortError' ? 'ai_service_timeout' : 'ai_service_unavailable';
}

function isSimpleBreakdownPayload(payload = {}) {
  const title = String(payload.title || '').toLowerCase();
  const description = String(payload.description || payload.task_description || '').toLowerCase();
  const category = String(payload.category || payload.task_category || '').toLowerCase();
  const signals = `${title} ${description} ${category}`;
  const difficulty = parseInteger(payload.difficulty_level, 3);
  const duration = parseInteger(payload.estimated_duration_minutes, 60);
  const priority = parseInteger(payload.priority_level, 3);
  const simpleRoutine = ['routine', 'personal', 'health', 'home', 'household'].includes(category) ||
    hasAny(signals, ['skin care', 'skincare', 'shower', 'brush', 'breakfast', 'lunch', 'dinner', 'walk', 'laundry', 'tidy', 'clean room', 'routine']);
  const complexCategory = ['study', 'coding', 'writing', 'project', 'design', 'presentation'].includes(category) ||
    hasAny(signals, ['project', 'presentation', 'poster', 'report', 'essay', 'code', 'database', 'api', 'research', 'exam', 'design', 'slides']);
  const multipleParts = hasMultipleWorkParts(description);

  if (duration < 60 && difficulty <= 2 && priority <= 3 && (simpleRoutine || !complexCategory)) return true;
  if (duration < 45 && difficulty <= 2 && priority <= 3 && !multipleParts) return true;
  return false;
}

function buildFallbackSubtaskPlan(payload) {
  const title = String(payload.title || 'the task').trim();
  const category = String(payload.category || payload.task_category || '').toLowerCase();
  const description = String(payload.description || payload.task_description || '').toLowerCase();
  const signals = `${title} ${category} ${description}`.toLowerCase();
  const difficulty = parseInteger(payload.difficulty_level, 3);
  const duration = parseInteger(payload.estimated_duration_minutes, 60);

  if (category === 'coding' || hasAny(signals, ['code', 'api', 'database', 'backend', 'frontend', 'bug', 'server'])) {
    return [
      `Review requirements and current behavior for ${title}`,
      'Identify the files and data affected by the change',
      'Implement the main logic update',
      'Test the updated behavior with realistic data',
      'Clean up and finalize the change'
    ];
  }
  if (category === 'writing' || hasAny(signals, ['write', 'essay', 'report', 'notes', 'document', 'article'])) {
    const steps = [
      `Outline the main sections for ${title}`,
      'Draft the key content in a clear order',
      'Revise wording, structure, and missing details',
      'Proofread and prepare the final version'
    ];
    if (difficulty >= 4 || duration >= 75) steps.splice(1, 0, 'Collect the references or examples needed');
    return steps;
  }
  if (hasAny(signals, ['presentation', 'slide'])) {
    return [
      'Define the main sections and order',
      'Collect needed materials or examples',
      'Write the slide content clearly',
      'Review structure and missing parts',
      'Prepare the final version'
    ];
  }
  if (hasAny(signals, ['poster', 'design', 'layout'])) {
    const steps = ['Review the current layout and final requirements'];
    if (hasAny(signals, ['ai', 'model', 'models'])) steps.push('Update the AI models section with clear model types');
    if (hasAny(signals, ['duplicate', 'duplicated', 'unnecessary', 'repeated'])) steps.push('Remove duplicated or unnecessary text');
    steps.push('Improve visual spacing, alignment, and hierarchy');
    steps.push(hasAny(signals, ['export', 'pdf', 'final']) ? 'Export and verify final PDF quality' : 'Review the final design for consistency');
    return steps;
  }
  if (category === 'study' || hasAnyWord(signals, ['study', 'exam', 'lecture', 'chapter', 'homework'])) {
    const steps = [
      `Review the goal and material for ${title}`,
      'Work through the most important examples',
      'Summarize the key ideas in your own words',
      'Check understanding with practice or recall'
    ];
    if (difficulty >= 4) steps.splice(2, 0, 'Mark confusing points for extra review');
    return steps;
  }

  const steps = [
    `Review the goal and expected result for ${title}`,
    'Prepare the needed materials or workspace',
    'Complete the highest-priority part first',
    'Check quality and fix any issues'
  ];
  if (difficulty >= 4 || duration >= 75) steps.splice(2, 0, 'Break the main work into smaller checkpoints');
  if (duration <= 30 && difficulty <= 2) return [steps[0], 'Complete the main action', 'Review the result'];
  return [...steps, 'Finalize and save the result'];
}

function hasAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}

function hasAnyWord(value, keywords) {
  return keywords.some((keyword) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(value));
}

function hasMultipleWorkParts(value) {
  if (!value) return false;
  const separators = (value.match(/,/g) || []).length +
    (value.match(/;/g) || []).length +
    (value.match(/\sand\s/g) || []).length +
    (value.match(/\sthen\s/g) || []).length;
  const actionWords = (value.match(/\b(update|add|fix|remove|export|review|write|collect|test|design|prepare)\b/g) || []).length;
  return separators >= 2 || actionWords >= 3;
}

function fallbackAdvice(payload, error) {
  const scope = payload.scope || payload.period || 'daily';
  const advice = [];
  const addAdvice = (note) => {
    const key = `${note.scope}|${note.advice_type}|${note.title}|${note.message}`;
    if (!advice.some((item) => `${item.scope}|${item.advice_type}|${item.title}|${item.message}` === key)) {
      advice.push(note);
    }
  };
  const checkin = payload.daily_checkin || payload;
  const energy = parseInteger(checkin.predicted_energy_level || checkin.energy_level, 3);
  const stress = parseInteger(checkin.stress_level, 3);
  const sleep = Number.parseFloat(checkin.sleep_hours || 7);
  const mood = parseInteger(checkin.mood_level, 3);
  const isTired = parseBoolean(checkin.is_tired);
  const unfinished = parseInteger(payload.unfinished_tasks_count, 0);
  const completed = parseInteger(payload.completed_tasks_count, 0);
  const productivity = Number.parseInt(payload.productivity_score ?? payload.completion_percentage, 10);
  const feedbackSummary = payload.feedback_summary || {};
  const deadlineTasks = Array.isArray(payload.deadline_tasks) ? payload.deadline_tasks : [];
  const currentTask = payload.current_task_status || null;
  const breaksCount = parseInteger(payload.breaks_count, 0);
  const hasCheckinData = ['mood_level', 'energy_level', 'predicted_energy_level', 'stress_level', 'sleep_hours']
    .some((key) => checkin?.[key] !== undefined && checkin?.[key] !== null);
  const hasTaskData = completed + unfinished > 0 || Boolean(currentTask) || deadlineTasks.length > 0;

  if (!hasCheckinData && !hasTaskData) {
    advice.push(buildAdviceNote('recommendation', 'No enough data yet', 'Add a daily check-in and tasks so the planner can generate personalized advice for this day.', 3, scope, payload));
    return {
      module: 'advice_generation',
      source: 'node_rule_based_fallback',
      model: 'local_advice_rules',
      advice,
      confidence: 0.45,
      fallback_reason: error.message
    };
  }

  if (energy <= 2 || sleep < 5.5 || isTired) {
    advice.push(buildAdviceNote('energy', 'Low energy plan', 'Your energy is low today. Start with easier tasks and add short breaks before difficult work.', 1, scope, payload));
  }
  if (energy >= 4 && sleep >= 7 && stress <= 2 && mood >= 4 && !isTired) {
    advice.push(buildAdviceNote('energy', 'Strong energy window', 'Your energy is strong today. This is a good time for difficult or high-priority tasks.', 2, scope, payload));
  }
  if (stress >= 4) {
    advice.push(buildAdviceNote('stress', 'High stress warning', 'Your stress level is high. Avoid placing many difficult tasks together.', 1, scope, payload));
  }
  if (unfinished > completed && unfinished > 1) {
    advice.push(buildAdviceNote('productivity', 'Focus unfinished tasks', `You still have ${unfinished} unfinished tasks. Start with the highest-priority item.`, 2, scope, payload));
  }
  if (!Number.isNaN(productivity) && productivity === 100) {
    advice.push(buildAdviceNote('productivity', 'Excellent progress today', 'Excellent progress today. You completed all planned tasks.', 2, scope, payload));
  } else if (!Number.isNaN(productivity) && productivity >= 80) {
    advice.push(buildAdviceNote('productivity', 'Good progress today', 'Good progress today. Keep using your strongest energy hours for difficult tasks.', 3, scope, payload));
  }
  if (parseInteger(feedbackSummary.overrun_count, 0) > 0) {
    advice.push(buildAdviceNote('time_management', 'Adjust future estimates', 'Some tasks took longer than expected. Similar tasks may need more time next time.', 2, scope, payload));
  }
  if (parseInteger(feedbackSummary.difficult_count, 0) > 0) {
    advice.push(buildAdviceNote('feedback', 'Add recovery after difficult work', 'The last task felt difficult. Consider adding a break before the next hard task.', 2, scope, payload));
  }
  if (deadlineTasks.length > 0) {
    advice.push(buildAdviceNote('deadline', 'Deadline needs attention', `${deadlineTasks[0].title || 'A deadline task'} needs focused time before lower-priority work.`, 2, scope, payload));
  }
  if (currentTask?.title) {
    advice.push(buildAdviceNote('task', 'Active task focus', `${currentTask.title} is currently in progress. Keep the next step small and update feedback when you finish.`, 3, 'task', payload, currentTask.task_id));
  }

  if (!hasTaskData) {
    addAdvice(buildAdviceNote('recommendation', 'No enough data yet', 'Your check-in is saved. Add tasks or generate a schedule so advice can connect to today\'s actual plan.', 3, scope, payload));
  } else {
    if (completed > 0) {
      addAdvice(buildAdviceNote('productivity', 'Completed task momentum', `You completed ${completed} task${completed === 1 ? '' : 's'} today. Use what worked in those blocks when planning the next task.`, 3, scope, payload));
    }
    if (unfinished > 0) {
      addAdvice(buildAdviceNote('schedule', 'Next task choice', `${unfinished} task${unfinished === 1 ? ' is' : 's are'} still waiting. Choose the highest-priority item before adding new work.`, 3, scope, payload));
    }
    if (!Number.isNaN(productivity) && productivity > 0 && productivity < 100) {
      addAdvice(buildAdviceNote('productivity', 'Progress snapshot', `Your current completion is ${productivity}%. Keep the next session focused on one clear task.`, 3, scope, payload));
    }
    if (sleep >= 7 && energy >= 3) {
      addAdvice(buildAdviceNote('energy', 'Rest supports focus', 'Your sleep looks supportive today. Protect the time block where you feel most alert.', 3, scope, payload));
    }
    if (stress <= 2) {
      addAdvice(buildAdviceNote('stress', 'Manageable stress', 'Stress looks manageable today. This is a good setup for steady focused work.', 3, scope, payload));
    }
    if (mood >= 4) {
      addAdvice(buildAdviceNote('mood', 'Positive mood momentum', 'Your mood check-in is positive. Use that momentum on work that needs attention and patience.', 3, scope, payload));
    }
    if (breaksCount > 0) {
      addAdvice(buildAdviceNote('schedule', 'Protect break time', `Your schedule includes ${breaksCount} break${breaksCount === 1 ? '' : 's'}. Keep that time for recovery instead of treating it like another task.`, 3, scope, payload));
    }
    if (advice.length < 5) {
      addAdvice(buildAdviceNote('schedule', 'Plan snapshot', `Today has ${completed} completed, ${unfinished} waiting, and ${currentTask ? '1 in progress' : 'none in progress'}. Keep the next step small and visible.`, 3, scope, payload));
    }
    if (advice.length < 5) {
      addAdvice(buildAdviceNote('recommendation', 'Keep the plan realistic', 'Match difficult work with your best energy and move non-urgent tasks if the day gets crowded.', 4, scope, payload));
    }
  }

  if (advice.length === 0) {
    advice.push(buildAdviceNote('recommendation', 'Keep the plan balanced', 'Use task progress and feedback to keep the next schedule realistic.', 3, scope, payload));
  }

  const complexDay = energy <= 2 ||
    stress >= 4 ||
    unfinished >= 4 ||
    deadlineTasks.length > 0 ||
    parseInteger(feedbackSummary.overrun_count, 0) > 0 ||
    parseInteger(feedbackSummary.difficult_count, 0) > 0;

  return {
    module: 'advice_generation',
    source: 'node_rule_based_fallback',
    model: 'local_advice_rules',
    advice: advice.slice(0, complexDay ? 12 : 6),
    confidence: 0.45,
    fallback_reason: error.message
  };
}

function buildAdviceNote(adviceType, title, message, priority, scope, payload, relatedTaskId = null) {
  return {
    advice_type: adviceType,
    title,
    message,
    priority,
    scope,
    related_date: payload.date || payload.related_date || null,
    related_task_id: relatedTaskId
  };
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}
