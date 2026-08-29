import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSubtasksWithAi } from './aiClient.js';

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
