import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAiPredictionLookupQuery } from './mysqlStore.js';
import { selectAiPredictionRows } from './jsonStore.js';
import {
  buildAdviceCacheIdentity,
  buildAdviceGenerationRequest,
  buildAdvicePredictionInput,
  buildAdvicePredictionOutput,
  getCachedAdviceResult
} from '../services/adviceGenerationPolicy.js';

function source(overrides = {}) {
  return {
    user_id: 'user-one',
    scope: 'daily',
    date: '2026-08-29',
    related_date: '2026-08-29',
    schedule_id: 'schedule-one',
    daily_checkin: { mood_level: 3, energy_level: 3, stress_level: 2, sleep_hours: 7, is_tired: false },
    completed_tasks_count: 0,
    unfinished_tasks_count: 0,
    waiting_tasks: [],
    completed_tasks: [],
    unfinished_tasks: [],
    deadline_tasks: [],
    task_feedback: [],
    ...overrides
  };
}

function acceptedResult(request) {
  return {
    source: 'openai_responses_api',
    provenance: 'openai_responses_api',
    model: 'gpt-5.6-luna',
    generated_by_ai: true,
    fallback_used: false,
    fallback_reason_category: null,
    advice: [{
      advice_type: 'recommendation',
      title: 'Choose one next step',
      message: 'Work in a short focused block.',
      priority: 3,
      scope: request.scope,
      task_ref: null
    }]
  };
}

function prediction(context, request, result = acceptedResult(request)) {
  return {
    user_id: context.user_id,
    related_task_id: context.related_task_id || null,
    related_schedule_id: context.schedule_id || null,
    module_name: 'advice_generation',
    source: 'openai_responses_api',
    input_json: buildAdvicePredictionInput(context, request, result),
    output_json: buildAdvicePredictionOutput(result, request)
  };
}

test('MySQL Advice lookup uses required parameterized owner and module filters', () => {
  assert.equal(buildAiPredictionLookupQuery('', 'advice_generation'), null);
  assert.equal(buildAiPredictionLookupQuery('user-one', ''), null);

  const query = buildAiPredictionLookupQuery('user-one', 'advice_generation');
  assert.match(query.sql, /user_id = :userId/);
  assert.match(query.sql, /module_name = :moduleName/);
  assert.deepEqual(query.params, { userId: 'user-one', moduleName: 'advice_generation' });
  assert.equal(query.sql.includes('user-one'), false);
});

test('JSON Advice lookup keeps old data unchanged and enforces user and module boundaries', () => {
  const oldData = { users: [{ user_id: 'user-one' }], tasks: [] };
  const before = structuredClone(oldData);
  assert.deepEqual(selectAiPredictionRows(oldData, 'user-one', 'advice_generation'), []);
  assert.deepEqual(oldData, before);

  const rows = [
    { user_id: 'user-one', module_name: 'advice_generation', created_at: '2026-08-29T10:00:00Z' },
    { user_id: 'user-two', module_name: 'advice_generation', created_at: '2026-08-29T11:00:00Z' },
    { user_id: 'user-one', module_name: 'subtask_generation', created_at: '2026-08-29T12:00:00Z' }
  ];
  assert.deepEqual(selectAiPredictionRows({ ai_predictions: rows }, 'user-one', 'advice_generation'), [rows[0]]);
});

test('MySQL and JSON cache candidates follow the same strict acceptance rules', () => {
  const context = source();
  const request = buildAdviceGenerationRequest(context);
  const identity = buildAdviceCacheIdentity(context, request);
  const accepted = prediction(context, request);
  const fallback = {
    ...accepted,
    output_json: { ...accepted.output_json, provenance: 'python_rule_based_fallback', generated_by_ai: false, fallback_used: true }
  };
  const invalidJson = { ...accepted, input_json: '{not-json' };
  const jsonRows = selectAiPredictionRows({ ai_predictions: [fallback, invalidJson, accepted] }, 'user-one', 'advice_generation');
  const mysqlRows = [fallback, invalidJson, accepted];

  const fromJson = jsonRows.map((row) => getCachedAdviceResult(row, request, identity)).find(Boolean);
  const fromMysql = mysqlRows.map((row) => getCachedAdviceResult(row, request, identity)).find(Boolean);
  assert.deepEqual(fromJson?.advice, fromMysql?.advice);
  assert.ok(fromJson);

  for (const inputChange of [
    { period_key: '2026-08-30' },
    { scope: 'weekly' },
    { schedule_revision_hash: 'sha256:other' },
    { context_hash: 'sha256:other' }
  ]) {
    const stale = { ...accepted, input_json: { ...accepted.input_json, ...inputChange } };
    assert.equal(getCachedAdviceResult(stale, request, identity), null);
  }
});
