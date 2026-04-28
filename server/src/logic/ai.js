const emotionWords = {
  stressed: ['stress', 'stressed', 'pressure', 'worried', 'overwhelmed', 'anxiety'],
  tired: ['tired', 'sleepy', 'fatigue', 'exhausted', 'no energy'],
  happy: ['happy', 'good', 'great', 'motivated', 'calm', 'fine'],
  sad: ['sad', 'down', 'upset', 'bad']
};

const categoryRules = [
  { category: 'study', words: ['study', 'course', 'exam', 'assignment', 'lecture', 'project', 'database'] },
  { category: 'coding', words: ['code', 'react', 'node', 'express', 'api', 'sql', 'frontend', 'backend'] },
  { category: 'writing', words: ['write', 'summary', 'report', 'presentation', 'document'] },
  { category: 'routine', words: ['meeting', 'call', 'email', 'clean', 'organize', 'buy'] }
];

export function detectLanguage(text = '') {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  return 'en';
}

export function analyzeMoodEnergy(input) {
  const moodLevel = clamp(input.mood_level, 1, 5, 3);
  const energyLevel = clamp(input.energy_level, 1, 5, 3);
  const stressLevel = clamp(input.stress_level, 1, 5, 3);
  const sleepHours = Number.parseFloat(input.sleep_hours ?? 7);
  const isTired = Boolean(input.is_tired);
  const moodText = String(input.mood_text_original || '');

  let predictedEnergy = energyLevel;
  if (sleepHours < 5) predictedEnergy -= 1;
  if (stressLevel >= 4) predictedEnergy -= 1;
  if (isTired) predictedEnergy -= 1;
  if (sleepHours >= 7 && moodLevel >= 4 && stressLevel <= 2) predictedEnergy += 1;
  predictedEnergy = clamp(predictedEnergy, 1, 5, energyLevel);

  return {
    detected_language: detectLanguage(moodText),
    mood_text_translated: moodText,
    detected_emotion: detectEmotion(moodText, moodLevel, stressLevel),
    predicted_energy_level: predictedEnergy,
    ai_advice: buildAdvice(predictedEnergy, stressLevel, isTired)
  };
}

export function categorizeTask(task) {
  const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
  const matched = categoryRules.find((rule) => rule.words.some((word) => text.includes(word)));
  const category = task.category || matched?.category || 'general';
  const difficulty = clamp(task.difficulty_level, 1, 5, defaultDifficulty(category, text));
  let estimated = Number.parseInt(task.estimated_duration_minutes, 10);
  if (Number.isNaN(estimated) || estimated <= 0) {
    estimated = defaultDuration(category, difficulty, text);
  }

  return {
    category,
    difficulty_level: difficulty,
    estimated_duration_minutes: estimated
  };
}

function detectEmotion(text, moodLevel, stressLevel) {
  const normalized = String(text || '').toLowerCase();
  for (const [emotion, words] of Object.entries(emotionWords)) {
    if (words.some((word) => normalized.includes(word))) return emotion;
  }
  if (stressLevel >= 4) return 'stressed';
  if (moodLevel <= 2) return 'low_mood';
  if (moodLevel >= 4) return 'positive';
  return 'neutral';
}

function defaultDifficulty(category, text) {
  if (category === 'coding' || category === 'study') return 4;
  if (category === 'writing') return 3;
  if (category === 'routine') return 2;
  if (/\b(final|exam|presentation|database)\b/.test(text)) return 4;
  return 3;
}

function defaultDuration(category, difficulty, text) {
  if (/\b(meeting|call|email)\b/.test(text)) return 30;
  if (category === 'routine') return 30;
  if (difficulty >= 4) return 90;
  return 60;
}

function buildAdvice(predictedEnergy, stressLevel, isTired) {
  if (predictedEnergy <= 2) return 'Low energy detected. Prefer easier tasks and shorter sessions.';
  if (stressLevel >= 4) return 'Stress is high. Add breaks and avoid too many heavy tasks together.';
  if (isTired) return 'Tiredness may reduce focus, so the schedule should stay lighter.';
  return 'Balanced day. Mix priorities with healthy breaks.';
}

function clamp(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
