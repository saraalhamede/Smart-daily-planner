import { analyzeMoodEnergy, categorizeTask } from '../logic/ai.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AI_TIMEOUT_MS = Number.parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '2500', 10);

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
    return await callAiService('/ai/generate-subtasks', payload);
  } catch (error) {
    console.warn('[AI] Subtask generation fallback used:', error.message);
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

async function callAiService(path, payload, method = 'POST') {
  if (process.env.AI_SERVICE_ENABLED === 'false') {
    throw new Error('AI service is disabled.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
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
    fatigue_detected: Boolean(payload.is_tired) || Number.parseFloat(payload.sleep_hours || 7) < 6,
    fatigue_score: Boolean(payload.is_tired) ? 2 : 0,
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
  const description = String(payload.description || '');
  const pieces = description
    .split(/[.;,]|\band\b/i)
    .map((piece) => piece.trim().replace(/^(then|also|to)\s+/i, ''))
    .filter((piece) => piece.length > 3)
    .slice(0, 5);
  const fallbackPieces = pieces.length > 0
    ? pieces
    : [
        `Review ${payload.title || 'task'} requirements`,
        'Complete the main work',
        'Review and finalize'
      ];
  return {
    module: 'subtask_generation',
    source: 'node_rule_based_fallback',
    model: 'local_action_extractor',
    subtasks: fallbackPieces.map((title, index) => ({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      order_index: index + 1
    })),
    confidence: 0.45,
    fallback_reason: error.message
  };
}

function fallbackAdvice(payload, error) {
  const scope = payload.scope || payload.period || 'daily';
  const advice = [];
  const checkin = payload.daily_checkin || payload;
  const energy = parseInteger(checkin.predicted_energy_level || checkin.energy_level, 3);
  const stress = parseInteger(checkin.stress_level, 3);
  const sleep = Number.parseFloat(checkin.sleep_hours || 7);
  const unfinished = parseInteger(payload.unfinished_tasks_count, 0);
  const completed = parseInteger(payload.completed_tasks_count, 0);
  const productivity = Number.parseInt(payload.productivity_score, 10);

  if (energy <= 2 || sleep < 5.5) {
    advice.push(buildAdviceNote('energy', 'Low energy plan', 'Your energy is low today. Start with easier tasks and add short breaks before difficult work.', 1, scope, payload));
  }
  if (stress >= 4) {
    advice.push(buildAdviceNote('stress', 'High stress warning', 'Your stress level is high. Avoid placing many difficult tasks together.', 1, scope, payload));
  }
  if (unfinished > completed && unfinished > 1) {
    advice.push(buildAdviceNote('productivity', 'Focus unfinished tasks', `You still have ${unfinished} unfinished tasks. Start with the highest-priority item.`, 2, scope, payload));
  }
  if (!Number.isNaN(productivity) && productivity >= 80) {
    advice.push(buildAdviceNote('productivity', 'Good progress today', 'Good progress today. Keep using your strongest energy hours for difficult tasks.', 3, scope, payload));
  }
  if (advice.length === 0) {
    advice.push(buildAdviceNote('recommendation', 'Keep the plan balanced', 'Use task progress and feedback to keep the next schedule realistic.', 3, scope, payload));
  }

  return {
    module: 'advice_generation',
    source: 'node_rule_based_fallback',
    model: 'local_advice_rules',
    advice,
    confidence: 0.45,
    fallback_reason: error.message
  };
}

function buildAdviceNote(adviceType, title, message, priority, scope, payload) {
  return {
    advice_type: adviceType,
    title,
    message,
    priority,
    scope,
    related_date: payload.date || payload.related_date || null,
    related_task_id: null
  };
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
