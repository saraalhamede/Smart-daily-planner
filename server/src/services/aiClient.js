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

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
