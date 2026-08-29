import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSubtaskPredictionInput,
  buildSubtaskPredictionOutput,
  isValidatedOpenAiSubtaskResult,
  safeSubtaskPredictionModel,
  shouldPersistGeneratedByAi
} from './subtaskGenerationPolicy.js';

function validResult(overrides = {}) {
  return {
    source: 'openai_responses_api',
    provenance: 'openai_responses_api',
    generated_by_ai: true,
    fallback_used: false,
    fallback_reason_category: null,
    model: 'gpt-5.6-luna',
    requested_model: 'gpt-5.6-luna',
    subtasks: [
      { title: 'Review the requirements', order_index: 1 },
      { title: 'Implement the main change', order_index: 2 }
    ],
    ...overrides
  };
}

test('accepts a complete validated OpenAI subtask result', () => {
  assert.equal(shouldPersistGeneratedByAi(validResult()), true);
});

test('rejects OpenAI claims without a model or with a fallback model', () => {
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ model: undefined })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ model: '   ' })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ model: 'local_ai_style_planner' })), false);
});

test('rejects incomplete success provenance claims', () => {
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ generated_by_ai: false })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ provenance: 'python_rule_based_fallback' })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ fallback_used: true })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ fallback_reason_category: 'timeout' })), false);
});

test('rejects invalid subtask counts, titles, and indexes', () => {
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({ subtasks: [{ title: 'Only one', order_index: 1 }] })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({
    subtasks: Array.from({ length: 6 }, (_, index) => ({ title: `Step ${index + 1}`, order_index: index + 1 }))
  })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({
    subtasks: [{ title: 'Repeat step', order_index: 1 }, { title: ' repeat  step ', order_index: 2 }]
  })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({
    subtasks: [{ title: 'First', order_index: 1 }, { title: 'Second', order_index: 3 }]
  })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({
    subtasks: [{ title: '', order_index: 1 }, { title: 'Second', order_index: 2 }]
  })), false);
  assert.equal(isValidatedOpenAiSubtaskResult(validResult({
    subtasks: [{ title: 'x'.repeat(121), order_index: 1 }, { title: 'Second', order_index: 2 }]
  })), false);
});

test('marks Python and Node fallbacks as non-Generative', () => {
  for (const provenance of ['python_rule_based_fallback', 'node_rule_based_fallback']) {
    assert.equal(isValidatedOpenAiSubtaskResult(validResult({
      source: provenance,
      provenance,
      generated_by_ai: false,
      fallback_used: true,
      fallback_reason_category: 'timeout',
      model: provenance === 'python_rule_based_fallback' ? 'rule_based_ai_style_planner' : 'local_ai_style_planner'
    })), false);
  }
});

test('does not mutate validation input', () => {
  const result = validResult({ subtasks: [{ title: '  First step  ', order_index: 1 }, { title: 'Second step', order_index: 2 }] });
  const original = structuredClone(result);

  assert.equal(isValidatedOpenAiSubtaskResult(result), true);
  assert.deepEqual(result, original);
});

test('prediction input metadata excludes raw text, IDs, and raw errors', () => {
  const metadata = buildSubtaskPredictionInput({
    title: 'Private task title',
    description: 'Private task description https://example.test',
    category: 'Private category',
    user_id: 'user-123',
    task_id: 'task-456',
    schedule_item_id: 'item-789',
    subtask_id: 'subtask-987',
    difficulty_level: 4,
    priority_level: 5,
    estimated_duration_minutes: 90
  }, validResult({ raw_error: 'synthetic provider failure' }));
  const serialized = JSON.stringify(metadata);

  for (const forbidden of ['Private task title', 'Private task description', 'Private category', 'user-123', 'task-456', 'item-789', 'subtask-987', 'synthetic provider failure', 'https://example.test']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(metadata.fields.title_present, true);
  assert.equal(metadata.fields.difficulty_level, 4);
});

test('prediction output stores only bounded accepted subtasks without a raw wrapper', () => {
  const output = buildSubtaskPredictionOutput(validResult({
    response: { output: 'synthetic raw provider response' },
    request_id: 'request-123'
  }));
  const serialized = JSON.stringify(output);

  assert.deepEqual(output.subtasks, [
    { title: 'Review the requirements', order_index: 1 },
    { title: 'Implement the main change', order_index: 2 }
  ]);
  assert.equal(serialized.includes('synthetic raw provider response'), false);
  assert.equal(serialized.includes('request-123'), false);
});

test('prediction model metadata rejects unvalidated and raw model values', () => {
  assert.equal(safeSubtaskPredictionModel(validResult()), 'gpt-5.6-luna');
  assert.equal(safeSubtaskPredictionModel(validResult({ model: 'untrusted-provider-model', fallback_used: true })), null);
  assert.equal(safeSubtaskPredictionModel(validResult({
    source: 'node_rule_based_fallback',
    provenance: 'node_rule_based_fallback',
    generated_by_ai: false,
    fallback_used: true,
    fallback_reason_category: 'timeout',
    model: 'local_ai_style_planner'
  })), 'local_ai_style_planner');
});
