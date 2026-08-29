import assert from 'node:assert/strict';
import test from 'node:test';

import { generateAdviceWithAi, generateSubtasksWithAi } from './aiClient.js';
import { buildAdviceGenerationRequest } from './adviceGenerationPolicy.js';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalEnabled = process.env.AI_GENERATIVE_ENABLED;
const originalTimeout = process.env.AI_GENERATIVE_SERVICE_TIMEOUT_MS;
const originalServiceEnabled = process.env.AI_SERVICE_ENABLED;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  restoreEnv('AI_GENERATIVE_ENABLED', originalEnabled);
  restoreEnv('AI_GENERATIVE_SERVICE_TIMEOUT_MS', originalTimeout);
  restoreEnv('AI_SERVICE_ENABLED', originalServiceEnabled);
});

test('uses the legacy AI service timeout while Generative AI is disabled', async () => {
  process.env.AI_GENERATIVE_ENABLED = 'false';
  const timeouts = captureTimeouts();
  globalThis.fetch = async () => successfulResponse({ source: 'python_rule_based_fallback' });

  await generateSubtasksWithAi(complexPayload());

  assert.deepEqual(timeouts, [2500]);
});

test('uses the scoped generative timeout only when Generative AI is enabled', async () => {
  process.env.AI_GENERATIVE_ENABLED = 'true';
  process.env.AI_GENERATIVE_SERVICE_TIMEOUT_MS = '7500';
  const timeouts = captureTimeouts();
  globalThis.fetch = async () => successfulResponse({ source: 'openai_responses_api' });

  await generateSubtasksWithAi(complexPayload());

  assert.deepEqual(timeouts, [7500]);
});

test('invalid scoped timeout uses the safe 7500ms default', async () => {
  process.env.AI_GENERATIVE_ENABLED = 'true';
  process.env.AI_GENERATIVE_SERVICE_TIMEOUT_MS = '2000';
  const timeouts = captureTimeouts();
  globalThis.fetch = async () => successfulResponse({ source: 'openai_responses_api' });

  await generateSubtasksWithAi(complexPayload());

  assert.deepEqual(timeouts, [7500]);
});

test('Flask failures use Node rule-based fallback with safe provenance', async () => {
  process.env.AI_GENERATIVE_ENABLED = 'true';
  globalThis.fetch = async () => {
    throw new Error('unreachable Flask detail');
  };

  const result = await generateSubtasksWithAi(complexPayload());

  assert.equal(result.source, 'node_rule_based_fallback');
  assert.equal(result.provenance, 'node_rule_based_fallback');
  assert.equal(result.generated_by_ai, false);
  assert.equal(result.fallback_used, true);
  assert.equal(result.fallback_reason_category, 'ai_service_unavailable');
  assert.equal('fallback_reason' in result, false);
});

test('an unvalidated OpenAI claim uses Node rule-based fallback', async () => {
  process.env.AI_GENERATIVE_ENABLED = 'true';
  globalThis.fetch = async () => successfulResponse({
    source: 'openai_responses_api',
    generated_by_ai: true,
    subtasks: [{ title: 'Only one step', order_index: 1 }]
  });

  const result = await generateSubtasksWithAi(complexPayload());

  assert.equal(result.provenance, 'node_rule_based_fallback');
  assert.equal(result.generated_by_ai, false);
  assert.equal(result.fallback_used, true);
});

test('Advice uses the legacy timeout while disabled and the scoped timeout while enabled', async () => {
  const request = buildAdviceGenerationRequest(advicePayload());
  const timeouts = captureTimeouts();
  globalThis.fetch = async () => successfulResponse({ source: 'python_rule_based_fallback' });
  process.env.AI_GENERATIVE_ENABLED = 'false';
  await generateAdviceWithAi(advicePayload(), { request });

  process.env.AI_GENERATIVE_ENABLED = 'true';
  process.env.AI_GENERATIVE_SERVICE_TIMEOUT_MS = '7500';
  globalThis.fetch = async () => successfulResponse(validAdviceResult(request));
  await generateAdviceWithAi({ legacy_context: advicePayload(), generative_context: request.providerContext }, { request });

  assert.deepEqual(timeouts, [2500, 7500]);
});

test('Advice Flask failures use a safe Node fallback without raw errors', async () => {
  const request = buildAdviceGenerationRequest(advicePayload());
  process.env.AI_GENERATIVE_ENABLED = 'true';
  globalThis.fetch = async () => {
    throw new Error('private Flask provider failure');
  };

  const result = await generateAdviceWithAi({ legacy_context: advicePayload(), generative_context: request.providerContext }, { request });

  assert.equal(result.source, 'node_rule_based_fallback');
  assert.equal(result.provenance, 'node_rule_based_fallback');
  assert.equal(result.generated_by_ai, false);
  assert.equal(result.fallback_used, true);
  assert.equal(result.fallback_reason_category, 'ai_service_unavailable');
  assert.equal(JSON.stringify(result).includes('private Flask provider failure'), false);
});

function complexPayload() {
  return {
    title: 'Prepare project presentation',
    description: 'Research, write slides, review, and rehearse.',
    category: 'presentation',
    difficulty_level: 4,
    priority_level: 4,
    estimated_duration_minutes: 120
  };
}

function advicePayload() {
  return {
    user_id: 'user-test',
    date: '2026-08-29',
    scope: 'daily',
    daily_checkin: { mood_level: 3, energy_level: 3, stress_level: 2, sleep_hours: 7 },
    mood_level: 3,
    energy_level: 3,
    stress_level: 2,
    sleep_hours: 7,
    completed_tasks_count: 1,
    unfinished_tasks_count: 2,
    productivity_score: 33,
    current_task_status: {
      task_id: 'task-current',
      title: 'Write report',
      description: 'Draft the report',
      status: 'in_progress',
      difficulty_level: 3,
      priority_level: 4,
      estimated_duration_minutes: 60
    },
    waiting_tasks: [],
    completed_tasks: [],
    unfinished_tasks: [],
    deadline_tasks: [],
    task_feedback: []
  };
}

function validAdviceResult(request) {
  return {
    module: 'advice_generation',
    source: 'openai_responses_api',
    provenance: 'openai_responses_api',
    model: 'gpt-5.6-luna',
    generated_by_ai: true,
    fallback_used: false,
    fallback_reason_category: null,
    advice: [{
      advice_type: 'productivity',
      title: 'Choose one next step',
      message: 'Keep the next task small and focused.',
      priority: 3,
      scope: request.scope,
      task_ref: 'current_task'
    }]
  };
}

function successfulResponse(body) {
  return {
    ok: true,
    json: async () => body
  };
}

function captureTimeouts() {
  const values = [];
  globalThis.setTimeout = (callback, timeout) => {
    values.push(timeout);
    return originalSetTimeout(callback, 60_000);
  };
  return values;
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
