const OPENAI_PROVENANCE = 'openai_responses_api';
const PYTHON_FALLBACK_PROVENANCE = 'python_rule_based_fallback';
const NODE_FALLBACK_PROVENANCE = 'node_rule_based_fallback';

const KNOWN_PROVENANCE = new Set([
  OPENAI_PROVENANCE,
  PYTHON_FALLBACK_PROVENANCE,
  NODE_FALLBACK_PROVENANCE
]);

const RULE_BASED_MODELS = new Set([
  'rule_based_ai_style_planner',
  'local_ai_style_planner',
  'local_rule_based',
  'local_advice_rules'
]);

const SAFE_FALLBACK_REASONS = new Set([
  'feature_disabled',
  'simple_task',
  'invalid_configuration',
  'missing_configuration',
  'invalid_input',
  'input_too_large',
  'unknown_schema',
  'sdk_unavailable',
  'provider_refusal',
  'incomplete_output',
  'invalid_structured_output',
  'local_validation_failure',
  'authentication_failure',
  'rate_limit',
  'timeout',
  'network_failure',
  'unexpected_provider_failure',
  'ai_service_timeout',
  'ai_service_unavailable'
]);

export function isValidatedOpenAiSubtaskResult(result) {
  if (!isRecord(result) ||
    result.source !== OPENAI_PROVENANCE ||
    result.provenance !== OPENAI_PROVENANCE ||
    result.generated_by_ai !== true ||
    result.fallback_used !== false ||
    (result.fallback_reason_category !== null && result.fallback_reason_category !== undefined)) {
    return false;
  }

  const model = normalizedModel(result.model);
  if (!model || RULE_BASED_MODELS.has(model.toLowerCase())) return false;

  const subtasks = result.subtasks;
  if (!Array.isArray(subtasks) || subtasks.length < 2 || subtasks.length > 5) return false;

  const titleKeys = new Set();
  const indexes = [];
  for (const subtask of subtasks) {
    if (!isRecord(subtask) || Object.keys(subtask).length !== 2 ||
      !Object.hasOwn(subtask, 'title') || !Object.hasOwn(subtask, 'order_index') ||
      typeof subtask.title !== 'string') {
      return false;
    }
    const title = subtask.title.trim();
    const titleKey = normalizeTitle(title);
    if (!title || title.length > 120 || titleKeys.has(titleKey) ||
      !Number.isInteger(subtask.order_index)) {
      return false;
    }
    titleKeys.add(titleKey);
    indexes.push(subtask.order_index);
  }

  return indexes.slice().sort((left, right) => left - right)
    .every((index, position) => index === position + 1);
}

export function shouldPersistGeneratedByAi(result) {
  return isValidatedOpenAiSubtaskResult(result);
}

export function normalizeSubtaskProvenance(result) {
  return safeProvenance(result);
}

export function safeSubtaskPredictionModel(result) {
  if (isValidatedOpenAiSubtaskResult(result)) return normalizedModel(result.model);

  const model = normalizedModel(result?.model).toLowerCase();
  const provenance = safeProvenance(result);
  if (RULE_BASED_MODELS.has(model) &&
    (provenance === PYTHON_FALLBACK_PROVENANCE || provenance === NODE_FALLBACK_PROVENANCE)) {
    return model;
  }
  return null;
}

export function buildSubtaskPredictionInput(input = {}, result = {}) {
  const accepted = isValidatedOpenAiSubtaskResult(result);
  return {
    feature: 'task_breakdown',
    provenance: normalizeSubtaskProvenance(result),
    validation_status: accepted ? 'accepted' : 'rejected',
    generated_by_ai: accepted,
    fallback_used: accepted ? false : Boolean(result?.fallback_used),
    fallback_reason_category: safeFallbackReason(result),
    requested_model: safeRequestedModel(result),
    actual_model: accepted ? safeSubtaskPredictionModel(result) : null,
    fields: {
      title_present: hasText(input?.title),
      description_present: hasText(input?.description),
      category_present: hasText(input?.category),
      difficulty_level: boundedInteger(input?.difficulty_level, 1, 5, 3),
      priority_level: boundedInteger(input?.priority_level, 1, 5, 3),
      estimated_duration_minutes: boundedInteger(input?.estimated_duration_minutes, 15, 480, 60)
    }
  };
}

export function buildSubtaskPredictionOutput(result = {}) {
  const accepted = isValidatedOpenAiSubtaskResult(result);
  return {
    feature: 'task_breakdown',
    provenance: normalizeSubtaskProvenance(result),
    validation_status: accepted ? 'accepted' : 'rejected',
    generated_by_ai: accepted,
    fallback_used: accepted ? false : Boolean(result?.fallback_used),
    fallback_reason_category: safeFallbackReason(result),
    model: safeSubtaskPredictionModel(result),
    skipped: Boolean(result?.skipped),
    subtasks: accepted ? copyValidatedSubtasks(result.subtasks) : [],
    subtask_count: accepted ? result.subtasks.length : 0
  };
}

function safeProvenance(result) {
  const candidate = result?.provenance || result?.source;
  return KNOWN_PROVENANCE.has(candidate) ? candidate : PYTHON_FALLBACK_PROVENANCE;
}

function safeFallbackReason(result) {
  const candidate = result?.fallback_reason_category;
  return SAFE_FALLBACK_REASONS.has(candidate) ? candidate : null;
}

function safeRequestedModel(result) {
  const candidate = normalizedModel(result?.requested_model);
  return candidate === 'gpt-5.6-luna' ? candidate : null;
}

function copyValidatedSubtasks(subtasks) {
  return subtasks.map((subtask) => ({
    title: subtask.title.trim(),
    order_index: subtask.order_index
  }));
}

function normalizedModel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTitle(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function hasText(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
