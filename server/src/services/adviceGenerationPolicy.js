import crypto from 'node:crypto';

const OPENAI_PROVENANCE = 'openai_responses_api';
const PYTHON_FALLBACK_PROVENANCE = 'python_rule_based_fallback';
const NODE_FALLBACK_PROVENANCE = 'node_rule_based_fallback';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const CONTEXT_VERSION = 'advice_context_v1';
const PROMPT_SCHEMA_VERSION = 'advice_v1';
const DEFAULT_MAX_INPUT_CHARS = 8000;
export const LEGACY_AI_NOTE_SOURCE = 'ai_model';

const ADVICE_TYPES = new Set([
  'recommendation', 'energy', 'stress', 'mood', 'productivity',
  'deadline', 'schedule', 'time_management', 'feedback', 'task'
]);
const ADVICE_SCOPES = new Set(['daily', 'weekly', 'monthly', 'task']);
const ADVICE_TASK_CATEGORIES = new Set(['study', 'coding', 'writing', 'routine', 'general']);
const RULE_BASED_MODELS = new Set([
  'rule_based_personalized_advice', 'local_advice_rules', 'local_rule_based'
]);
const SAFE_FALLBACK_REASONS = new Set([
  'feature_disabled', 'missing_configuration', 'invalid_configuration',
  'invalid_input', 'input_too_large', 'sdk_unavailable', 'provider_refusal',
  'incomplete_output', 'invalid_structured_output', 'local_validation_failure',
  'authentication_failure', 'rate_limit', 'timeout', 'network_failure',
  'unexpected_provider_failure', 'ai_service_timeout', 'ai_service_unavailable'
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[A-Z0-9._~+/-]{10,}\b/gi;
const NAMED_TOKEN_PATTERN = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token)\s*[:=]\s*[^\s,;]+/gi;
const API_KEY_PATTERN = /\b(?:sk|rk|pk|ghp)[_-][A-Z0-9_-]{10,}\b/gi;
const LONG_IDENTIFIER_PATTERN = /\b[A-Z0-9_-]{32,}\b/gi;
// Require grouped digits so ordinary dates, scores, counts, and durations are not redacted.
const PHONE_PATTERN = /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})(?:[ .-]?\d{3,4}){2}(?!\d)/g;
const SENSITIVE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:https?:\/\/|www\.)[^\s<>]+|\bbearer\s+[A-Z0-9._~+/-]{10,}\b|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token)\s*[:=]\s*[^\s,;]+|\b(?:sk|rk|pk|ghp)[_-][A-Z0-9_-]{10,}\b|(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})(?:[ .-]?\d{3,4}){2}(?!\d)|\b[A-Z0-9_-]{32,}\b/i;
const INSTRUCTION_LEAK_PATTERN = /\b(?:system\s+prompt|developer\s+instructions?|hidden\s+instructions?|ignore\s+previous\s+instructions?)\b|assistant\s+to=/i;
const UNSAFE_ADVICE_PATTERN = /\b(?:diagnos(?:e|is)|treatment|medication|prescri(?:be|ption)|self-harm|suicide|emergency\s+services?)\b/i;
const ACTION_CLAIM_PATTERN = /\b(?:i|we|the\s+(?:assistant|system|planner))\s+(?:have\s+)?(?:created|moved|deleted|reordered|rescheduled|completed|started|changed)\b/i;
const SCHEDULE_MUTATION_CLAIM_PATTERN = /\b(?:i|we|the\s+(?:assistant|system|planner))\s+(?:have\s+)?(?:modified|updated|changed)\s+(?:the\s+)?schedule\b/i;
const FIXED_TASK_OVERRIDE_PATTERN = /\b(?:move|reschedule|change|override)\s+(?:the\s+|your\s+)?fixed(?:[-\s]time)?\s+task\b|\bchange\s+(?:the\s+|your\s+)?fixed(?:[-\s]time)?\b/i;
const MENTAL_HEALTH_CERTAINTY_PATTERN = /\b(?:you\s+(?:have|are)|your\s+(?:stress|mood)\s+(?:proves?|confirms?|indicates?))\s+(?:clinically\s+)?(?:depress(?:ion|ed)|anxious|anxiety|mental\s+disorder)\b/i;

export function buildAdviceGenerationRequest(context = {}, options = {}) {
  const scope = normalizeScope(context.scope || context.period);
  const built = buildProviderContext(context, scope, options.maxInputChars);
  if (!built) return null;
  const { providerContext, taskReferences } = built;
  const periodKey = buildPeriodKey(context, scope);

  const requestedModel = options.requestedModel === DEFAULT_MODEL ? DEFAULT_MODEL : DEFAULT_MODEL;
  const hashMaterial = {
    feature: 'context_aware_advice',
    scope,
    prompt_schema_version: PROMPT_SCHEMA_VERSION,
    requested_model: requestedModel,
    context: providerContext
  };

  return {
    scope,
    providerContext,
    taskReferences,
    periodKey,
    scheduleRevisionHash: buildScheduleRevisionHash(context, scope, periodKey),
    requestedModel,
    promptSchemaVersion: PROMPT_SCHEMA_VERSION,
    contextHash: hashCanonicalValue(hashMaterial)
  };
}

export function buildAdviceCacheIdentity(context = {}, request = null) {
  if (!request?.periodKey || !request?.scheduleRevisionHash || !context?.user_id) return null;
  return {
    userId: String(context.user_id),
    scope: request.scope,
    periodKey: request.periodKey,
    scheduleRevisionHash: request.scheduleRevisionHash,
    promptSchemaVersion: request.promptSchemaVersion,
    requestedModel: request.requestedModel,
    contextHash: request.contextHash,
    relatedTaskId: context.related_task_id ? String(context.related_task_id) : null,
    relatedScheduleId: context.schedule_id ? String(context.schedule_id) : null
  };
}

export function buildAdviceSingleFlightKey(identity) {
  if (!identity) return null;
  return hashCanonicalValue({
    feature: 'context_aware_advice_single_flight_v1',
    user: identity.userId,
    scope: identity.scope,
    period_key: identity.periodKey,
    schedule_revision_hash: identity.scheduleRevisionHash,
    prompt_schema_version: identity.promptSchemaVersion,
    requested_model: identity.requestedModel,
    context_hash: identity.contextHash,
    related_task_id: identity.relatedTaskId
  });
}

export function isValidatedOpenAiAdviceResult(result, request) {
  if (!isRecord(result) || !request ||
    result.source !== OPENAI_PROVENANCE ||
    result.provenance !== OPENAI_PROVENANCE ||
    result.generated_by_ai !== true ||
    result.fallback_used !== false ||
    (result.fallback_reason_category !== null && result.fallback_reason_category !== undefined)) {
    return false;
  }

  const model = normalizeText(result.model, 120);
  if (!model || RULE_BASED_MODELS.has(model.toLowerCase()) || !Array.isArray(result.advice) ||
    result.advice.length < 1 || result.advice.length > 6) {
    return false;
  }

  const allowedReferences = new Set(Object.keys(request.taskReferences || {}));
  const duplicateKeys = new Set();
  for (const item of result.advice) {
    if (!isRecord(item) || Object.keys(item).length !== 6 ||
      !Object.hasOwn(item, 'advice_type') || !Object.hasOwn(item, 'title') ||
      !Object.hasOwn(item, 'message') || !Object.hasOwn(item, 'priority') ||
      !Object.hasOwn(item, 'scope') || !Object.hasOwn(item, 'task_ref') ||
      !ADVICE_TYPES.has(item.advice_type) || item.scope !== request.scope ||
      !Number.isInteger(item.priority) || item.priority < 1 || item.priority > 4 ||
      (item.task_ref !== null && typeof item.task_ref !== 'string')) {
      return false;
    }

    const title = normalizeText(item.title, 101);
    const message = normalizeText(item.message, 281);
    if (!title || !message || title.length > 100 || message.length > 280 ||
      hasUnsafeAdviceText(title) || hasUnsafeAdviceText(message)) {
      return false;
    }
    if (item.task_ref !== null && !allowedReferences.has(item.task_ref)) return false;
    if (item.scope === 'task' && item.task_ref === null) return false;

    const key = [item.advice_type, item.scope, item.task_ref || '', normalizeComparison(title), normalizeComparison(message)].join('|');
    if (duplicateKeys.has(key)) return false;
    duplicateKeys.add(key);
  }
  return true;
}

export function normalizeAdviceProvenance(result) {
  const candidate = result?.provenance || result?.source;
  return [OPENAI_PROVENANCE, PYTHON_FALLBACK_PROVENANCE, NODE_FALLBACK_PROVENANCE].includes(candidate)
    ? candidate
    : PYTHON_FALLBACK_PROVENANCE;
}

export function buildAdvicePredictionInput(context = {}, request = null, result = {}) {
  const accepted = isValidatedOpenAiAdviceResult(result, request);
  return {
    feature: 'context_aware_advice',
    scope: request?.scope || normalizeScope(context.scope || context.period),
    prompt_schema_version: request?.promptSchemaVersion || PROMPT_SCHEMA_VERSION,
    context_hash: request?.contextHash || null,
    period_key: request?.periodKey || buildPeriodKey(context, normalizeScope(context.scope || context.period)),
    schedule_revision_hash: request?.scheduleRevisionHash || null,
    fields: {
      mood_present: numericPresent(context.mood_level ?? context.daily_checkin?.mood_level),
      energy_present: numericPresent(context.energy_level ?? context.daily_checkin?.predicted_energy_level ?? context.daily_checkin?.energy_level),
      stress_present: numericPresent(context.stress_level ?? context.daily_checkin?.stress_level),
      sleep_present: numericPresent(context.sleep_hours ?? context.daily_checkin?.sleep_hours),
      mood_note_present: hasText(context.daily_checkin?.mood_text_original),
      feedback_comment_present: hasText(latestFeedback(context)?.comment),
      waiting_count: boundedInteger(context.unfinished_tasks_count ?? context.waiting_tasks?.length, 0, 999, 0),
      completed_count: boundedInteger(context.completed_tasks_count ?? context.completed_tasks?.length, 0, 999, 0),
      productivity_score: boundedNullableInteger(context.productivity_score ?? context.completion_percentage, 0, 100),
      breaks_count: boundedInteger(context.breaks_count, 0, 99, 0)
    },
    requested_provider: request ? OPENAI_PROVENANCE : null,
    requested_model: request?.requestedModel || null,
    actual_provider: accepted ? OPENAI_PROVENANCE : null,
    actual_model: accepted ? normalizeText(result.model, 120) : null,
    validation_status: accepted ? 'accepted' : 'fallback',
    provenance: normalizeAdviceProvenance(result),
    fallback_used: accepted ? false : Boolean(result?.fallback_used),
    fallback_reason_category: accepted ? null : safeFallbackReason(result),
    token_usage: accepted ? safeTokenUsage(result) : null
  };
}

export function buildAdvicePredictionOutput(result = {}, request = null) {
  const accepted = isValidatedOpenAiAdviceResult(result, request);
  return {
    feature: 'context_aware_advice',
    scope: request?.scope || null,
    context_hash: request?.contextHash || null,
    period_key: request?.periodKey || null,
    schedule_revision_hash: request?.scheduleRevisionHash || null,
    prompt_schema_version: request?.promptSchemaVersion || null,
    requested_model: request?.requestedModel || null,
    provenance: normalizeAdviceProvenance(result),
    validation_status: accepted ? 'accepted' : 'fallback',
    generated_by_ai: accepted,
    fallback_used: accepted ? false : Boolean(result?.fallback_used),
    fallback_reason_category: accepted ? null : safeFallbackReason(result),
    model: accepted ? normalizeText(result.model, 120) : null,
    advice: accepted ? copyValidatedAdvice(result.advice) : []
  };
}

export function getCachedAdviceResult(prediction, request, identity = null) {
  const input = parseRecord(prediction?.input_json);
  const output = parseRecord(prediction?.output_json);
  if (!identity || !input || !output || prediction?.user_id !== identity.userId ||
    prediction?.module_name !== 'advice_generation' ||
    prediction?.source !== OPENAI_PROVENANCE ||
    prediction?.related_task_id !== identity.relatedTaskId ||
    prediction?.related_schedule_id !== identity.relatedScheduleId ||
    input.feature !== 'context_aware_advice' || input.validation_status !== 'accepted' ||
    input.context_hash !== identity.contextHash || input.scope !== identity.scope ||
    input.period_key !== identity.periodKey || input.schedule_revision_hash !== identity.scheduleRevisionHash ||
    input.prompt_schema_version !== identity.promptSchemaVersion || input.requested_model !== identity.requestedModel ||
    input.actual_provider !== OPENAI_PROVENANCE || !normalizeText(input.actual_model, 120) ||
    output.feature !== 'context_aware_advice' || output.validation_status !== 'accepted' ||
    output.context_hash !== identity.contextHash || output.scope !== identity.scope ||
    output.period_key !== identity.periodKey || output.schedule_revision_hash !== identity.scheduleRevisionHash ||
    output.prompt_schema_version !== identity.promptSchemaVersion || output.requested_model !== identity.requestedModel ||
    output.provenance !== OPENAI_PROVENANCE || output.generated_by_ai !== true ||
    output.fallback_used !== false || output.fallback_reason_category !== null ||
    output.model !== input.actual_model) {
    return null;
  }

  const result = {
    module: 'advice_generation',
    source: output.provenance,
    provenance: output.provenance,
    model: output.model,
    generated_by_ai: output.generated_by_ai,
    fallback_used: output.fallback_used,
    fallback_reason_category: output.fallback_reason_category,
    advice: output.advice
  };
  return isValidatedOpenAiAdviceResult(result, request) ? result : null;
}

export function createAdviceSingleFlight() {
  const pending = new Map();
  const singleFlight = async function singleFlight(key, operation) {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(operation).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
  singleFlight.pendingCount = () => pending.size;
  return singleFlight;
}

export function isGenerativeAdviceEnabled() {
  return String(process.env.AI_GENERATIVE_ENABLED || '').trim().toLowerCase() === 'true';
}

function buildProviderContext(context, scope, configuredMaximum) {
  const taskReferences = new Map();
  const current = mapTaskEntry(context.current_task_status, 'current_task', taskReferences);
  const deadlines = mapTaskList(context.deadline_tasks, 'deadline', taskReferences, 5);
  const waiting = mapTaskList([...(asArray(context.waiting_tasks)), ...(asArray(context.unfinished_tasks))], 'waiting', taskReferences, 10);
  const completed = mapTaskList(context.completed_tasks, 'completed', taskReferences, 10);
  const limit = boundedInteger(configuredMaximum, 2000, DEFAULT_MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const providerContext = {
    context_version: CONTEXT_VERSION,
    scope,
    checkin: {
      mood_level: boundedNullableInteger(context.mood_level ?? context.daily_checkin?.mood_level, 1, 5),
      energy_level: boundedNullableInteger(context.energy_level ?? context.daily_checkin?.predicted_energy_level ?? context.daily_checkin?.energy_level, 1, 5),
      stress_level: boundedNullableInteger(context.stress_level ?? context.daily_checkin?.stress_level, 1, 5),
      sleep_hours: boundedNullableNumber(context.sleep_hours ?? context.daily_checkin?.sleep_hours, 0, 24),
      is_tired: Boolean(context.daily_checkin?.is_tired)
    },
    aggregates: {
      waiting_count: boundedInteger(context.unfinished_tasks_count ?? waiting.length, 0, 999, 0),
      in_progress_count: current ? 1 : 0,
      completed_count: boundedInteger(context.completed_tasks_count ?? completed.length, 0, 999, 0),
      productivity_score: boundedNullableInteger(context.productivity_score ?? context.completion_percentage, 0, 100),
      breaks_count: boundedInteger(context.breaks_count, 0, 99, 0),
      break_duration_minutes: boundedInteger(totalBreakDuration(context), 0, 1440, 0)
    },
    tasks: {
      current_task: current,
      waiting,
      completed,
      deadline_tasks: deadlines
    },
    recent_feedback: mapFeedback(latestFeedback(context), taskReferences),
    period_summaries: buildPeriodSummaries(context, scope)
  };

  return canonicalJson(providerContext).length <= limit
    ? { providerContext, taskReferences: localTaskReferenceMap(taskReferences) }
    : null;
}

function mapTaskList(values, prefix, taskReferences, maximum) {
  const seen = new Set();
  const sorted = asArray(values)
    .filter(isRecord)
    .sort(compareTaskCandidates);
  const entries = [];
  for (const item of sorted) {
    const localKey = taskLocalKey(item);
    if (seen.has(localKey)) continue;
    seen.add(localKey);
    const entry = mapTaskEntry(item, `${prefix}_${entries.length + 1}`, taskReferences);
    if (entry) entries.push(entry);
    if (entries.length >= maximum) break;
  }
  return entries;
}

function mapTaskEntry(value, preferredReference, taskReferences) {
  if (!isRecord(value)) return null;
  const localKey = taskLocalKey(value);
  const existingReference = taskReferences.get(localKey);
  const taskRef = existingReference?.task_ref || preferredReference;
  const localTaskId = value.task_id || value.task?.task_id || null;
  const subtasks = asArray(value.subtasks);
  const completedSubtasks = subtasks.filter((item) => Boolean(item?.is_completed ?? item?.completed)).length;
  const totalSubtasks = subtasks.length || boundedInteger(value.subtask_total_count, 0, 999, 0);
  const percentage = boundedNullableInteger(value.progress_percentage ?? value.subtask_progress_percentage, 0, 100);
  const days = boundedNullableInteger(value.days_left ?? value.deadline_distance_days, 0, 999);
  const entry = {
    task_ref: taskRef,
    category: normalizeAdviceTaskCategory(value.category || value.task?.category),
    status: normalizeTaskStatus(value.status || value.task?.status),
    difficulty: boundedNullableInteger(value.difficulty_level ?? value.task?.difficulty_level, 1, 5),
    priority: boundedNullableInteger(value.priority_level ?? value.task?.priority_level, 1, 5),
    planned_duration_minutes: boundedNullableInteger(value.planned_duration_minutes ?? value.estimated_duration_minutes ?? value.task?.estimated_duration_minutes, 15, 480),
    actual_duration_minutes: boundedNullableInteger(value.actual_duration_minutes, 0, 1440),
    deadline_status: deadlineStatus(value, days),
    deadline_distance_days: days,
    subtask_completed_count: boundedInteger(value.subtask_completed_count, 0, 999, completedSubtasks),
    subtask_total_count: totalSubtasks,
    subtask_progress_percentage: percentage
  };
  taskReferences.set(localKey, { task_ref: taskRef, local_task_id: localTaskId });
  return entry;
}

function mapFeedback(value, taskReferences) {
  if (!isRecord(value)) return null;
  const taskReference = taskReferences.get(taskLocalKey(value));
  return {
    task_ref: taskReference?.task_ref || null,
    outcome: normalizeTaskStatus(value.outcome || (value.completed ? 'completed' : 'waiting')),
    actual_duration_minutes: boundedNullableInteger(value.actual_duration_minutes, 0, 1440),
    planned_duration_minutes: boundedNullableInteger(value.planned_duration_minutes ?? value.estimated_duration_minutes, 15, 480),
    difficulty_feedback: boundedNullableInteger(value.difficulty_feedback, 1, 5),
    energy_after: boundedNullableInteger(value.energy_after, 1, 5),
    mood_after: boundedNullableInteger(value.mood_after, 1, 5)
  };
}

function buildPeriodSummaries(context, scope) {
  if (!['weekly', 'monthly'].includes(scope)) return [];
  const logs = asArray(context.daily_checkins || context.daily_logs);
  const evaluations = asArray(context.daily_evaluations);
  const evaluationByDate = new Map(evaluations.map((item) => [dateKey(item.evaluation_date || item.created_at), item]));
  const maximum = scope === 'weekly' ? 7 : 31;
  return logs
    .slice()
    .sort((left, right) => dateKey(left.log_date || left.checkin_date || left.created_at).localeCompare(dateKey(right.log_date || right.checkin_date || right.created_at)))
    .slice(-maximum)
    .map((log) => {
      const evaluation = evaluationByDate.get(dateKey(log.log_date || log.checkin_date || log.created_at)) || {};
      return {
        mood_level: boundedNullableInteger(log.mood_level, 1, 5),
        energy_level: boundedNullableInteger(log.predicted_energy_level ?? log.energy_level, 1, 5),
        stress_level: boundedNullableInteger(log.stress_level, 1, 5),
        sleep_hours: boundedNullableNumber(log.sleep_hours, 0, 24),
        productivity_score: boundedNullableInteger(evaluation.productivity_score, 0, 100),
        completed_count: boundedInteger(evaluation.completed_tasks, 0, 999, 0),
        unfinished_count: boundedInteger(evaluation.unfinished_tasks, 0, 999, 0)
      };
    });
}

function localTaskReferenceMap(references) {
  const mapping = {};
  for (const value of references.values()) {
    mapping[value.task_ref] = value.local_task_id || null;
  }
  return mapping;
}

function buildPeriodKey(context, scope) {
  if (scope === 'daily') return strictDateKey(context.date || context.related_date);
  if (scope === 'monthly') {
    const monthDate = strictDateKey(context.start_date || context.date || context.related_date);
    return monthDate ? monthDate.slice(0, 7) : null;
  }
  if (scope === 'task') {
    const taskDate = strictDateKey(context.date || context.related_date || context.start_date);
    return taskDate ? `task:${taskDate}` : null;
  }
  const start = sundayStartKey(context.start_date || context.date || context.related_date);
  return start ? `${start}..${addDays(start, 6)}` : null;
}

function buildScheduleRevisionHash(context, scope, periodKey) {
  if (!periodKey) return null;
  const scheduledItems = asArray(context.schedule_items);
  const items = asArray(scheduledItems.length > 0 ? scheduledItems : context.items)
    .filter(isRecord)
    .map((item) => ({
      schedule_id: nullableInternalValue(item.schedule_id),
      schedule_item_id: nullableInternalValue(item.schedule_item_id),
      task_id: nullableInternalValue(item.task_id || item.task?.task_id),
      start_time: normalizeText(item.start_time, 40) || null,
      end_time: normalizeText(item.end_time, 40) || null,
      status: normalizeText(item.status, 30) || null,
      task_kind: normalizeText(item.task_kind, 30) || null,
      created_at: normalizeText(item.created_at, 40) || null,
      updated_at: normalizeText(item.updated_at, 40) || null
    }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const schedules = asArray(context.schedules)
    .filter(isRecord)
    .map((schedule) => ({
      schedule_id: nullableInternalValue(schedule.schedule_id),
      schedule_date: strictDateKey(schedule.schedule_date),
      status: normalizeText(schedule.status, 30) || null,
      generated_at: normalizeText(schedule.generated_at, 40) || null,
      updated_at: normalizeText(schedule.updated_at, 40) || null
    }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const scheduleId = nullableInternalValue(context.schedule_id);
  if (!scheduleId && items.length === 0 && schedules.length === 0) return null;

  return hashCanonicalValue({
    feature: 'local_schedule_revision_v1',
    scope,
    period_key: periodKey,
    schedule_id: scheduleId,
    schedules,
    schedule_items: items
  });
}

function compareTaskCandidates(left, right) {
  const leftDays = boundedNullableInteger(left.days_left ?? left.deadline_distance_days, 0, 999);
  const rightDays = boundedNullableInteger(right.days_left ?? right.deadline_distance_days, 0, 999);
  const byDeadline = (leftDays ?? 1000) - (rightDays ?? 1000);
  if (byDeadline !== 0) return byDeadline;
  const byPriority = boundedInteger(right.priority_level, 1, 5, 3) - boundedInteger(left.priority_level, 1, 5, 3);
  if (byPriority !== 0) return byPriority;
  return taskLocalKey(left).localeCompare(taskLocalKey(right));
}

function taskLocalKey(value) {
  return String(value?.task_id || value?.task?.task_id || value?.schedule_item_id || `${value?.title || ''}|${value?.status || ''}`);
}

function totalBreakDuration(context) {
  return asArray(context.schedule_items || context.items)
    .filter((item) => item?.task_kind === 'break' || item?.status === 'break')
    .reduce((sum, item) => sum + (
      boundedInteger(item?.duration_minutes, 0, 1440, 0) || durationBetween(item?.start_time, item?.end_time)
    ), 0);
}

function durationBetween(start, end) {
  const startTime = new Date(start || '').getTime();
  const endTime = new Date(end || '').getTime();
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime
    ? Math.round((endTime - startTime) / 60000)
    : 0;
}

function latestFeedback(context) {
  const feedback = asArray(context.task_feedback || context.feedback);
  return feedback.slice().sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))[0] || null;
}

function deadlineStatus(value, days) {
  if (!value?.deadline && days === null) return 'none';
  if (days === null) return 'scheduled';
  if (days === 0) return 'due_today';
  return `due_in_${days}_days`;
}

function normalizeTaskStatus(value) {
  const status = String(value || 'waiting').trim().toLowerCase();
  return ['waiting', 'in_progress', 'completed', 'overdue', 'removed'].includes(status) ? status : 'waiting';
}

function normalizeAdviceTaskCategory(value) {
  const category = sanitizeAdviceText(value, 40).toLowerCase();
  return ADVICE_TASK_CATEGORIES.has(category) ? category : 'general';
}

function hasUnsafeAdviceText(value) {
  return SENSITIVE_PATTERN.test(value) || INSTRUCTION_LEAK_PATTERN.test(value) ||
    UNSAFE_ADVICE_PATTERN.test(value) || ACTION_CLAIM_PATTERN.test(value) ||
    SCHEDULE_MUTATION_CLAIM_PATTERN.test(value) || FIXED_TASK_OVERRIDE_PATTERN.test(value) ||
    MENTAL_HEALTH_CERTAINTY_PATTERN.test(value);
}

function copyValidatedAdvice(advice) {
  return advice.map((item) => ({
    advice_type: item.advice_type,
    title: normalizeText(item.title, 100),
    message: normalizeText(item.message, 280),
    priority: item.priority,
    scope: item.scope,
    task_ref: item.task_ref
  }));
}

function safeFallbackReason(result) {
  return SAFE_FALLBACK_REASONS.has(result?.fallback_reason_category)
    ? result.fallback_reason_category
    : null;
}

function safeTokenUsage(result) {
  const input_tokens = boundedNullableInteger(result.input_tokens, 0, 1_000_000);
  const output_tokens = boundedNullableInteger(result.output_tokens, 0, 1_000_000);
  const total_tokens = boundedNullableInteger(result.total_tokens, 0, 1_000_000);
  return input_tokens === null && output_tokens === null && total_tokens === null
    ? null
    : { input_tokens, output_tokens, total_tokens };
}

function hashCanonicalValue(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'string') return normalizeText(value, Number.MAX_SAFE_INTEGER);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return null;
}

function parseRecord(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeScope(value) {
  const scope = String(value || 'daily').trim().toLowerCase();
  if (ADVICE_SCOPES.has(scope)) return scope;
  return scope === 'week' ? 'weekly' : 'daily';
}

function normalizeText(value, maximum) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

export function sanitizeAdviceText(value, maximum) {
  return normalizeText(value, maximum)
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(URL_PATTERN, '[redacted-url]')
    .replace(BEARER_TOKEN_PATTERN, '[redacted-token]')
    .replace(NAMED_TOKEN_PATTERN, '[redacted-token]')
    .replace(API_KEY_PATTERN, '[redacted-token]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .replace(LONG_IDENTIFIER_PATTERN, '[redacted-id]');
}

function normalizeComparison(value) {
  return normalizeText(value, Number.MAX_SAFE_INTEGER).toLowerCase();
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function boundedNullableInteger(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : null;
}

function boundedNullableNumber(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : null;
}

function numericPresent(value) {
  return boundedNullableNumber(value, -1_000_000, 1_000_000) !== null;
}

function hasText(value) {
  return Boolean(normalizeText(value, 1));
}

function dateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function strictDateKey(value) {
  const key = dateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) || formatDateKey(date) !== key ? null : key;
}

function sundayStartKey(value) {
  const key = strictDateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return formatDateKey(date);
}

function addDays(dateKeyValue, days) {
  const date = new Date(`${dateKeyValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nullableInternalValue(value) {
  const normalized = normalizeText(value, 160);
  return normalized || null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
