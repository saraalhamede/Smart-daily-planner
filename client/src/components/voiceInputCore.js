export const DEFAULT_VOICE_LANGUAGE = 'en-US';

export const VOICE_LANGUAGES = Object.freeze([
  { value: 'en-US', label: 'English' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'he-IL', label: 'Hebrew' }
]);

export const voiceSessionLock = createVoiceSessionLock();

export function createVoiceSessionLock() {
  let activeOwner = null;
  const subscribers = new Set();

  function publish() {
    subscribers.forEach((subscriber) => subscriber(activeOwner));
  }

  return {
    acquire(owner) {
      if (!owner || (activeOwner && activeOwner !== owner)) return false;
      activeOwner = owner;
      publish();
      return true;
    },
    getOwner() {
      return activeOwner;
    },
    release(owner) {
      if (!owner || activeOwner !== owner) return false;
      activeOwner = null;
      publish();
      return true;
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    }
  };
}

export function insertTranscriptAtSelection(value, transcript, selectionStart, selectionEnd = selectionStart) {
  const currentValue = String(value || '');
  const spokenText = String(transcript || '').trim();
  const start = clampOffset(selectionStart, currentValue.length);
  const end = Math.max(start, clampOffset(selectionEnd, currentValue.length));

  if (!spokenText) {
    return {
      value: currentValue,
      selectionStart: start,
      selectionEnd: start
    };
  }

  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const prefix = needsLeadingSpace(before, spokenText) ? ' ' : '';
  const suffix = needsTrailingSpace(spokenText, after) ? ' ' : '';
  const insertedText = `${prefix}${spokenText}${suffix}`;
  const cursor = before.length + prefix.length + spokenText.length;

  return {
    value: `${before}${insertedText}${after}`,
    selectionStart: cursor,
    selectionEnd: cursor
  };
}

export function getSpeechRecognitionErrorMessage(errorCode) {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied. You can allow access and retry, or keep typing.';
    case 'audio-capture':
      return 'No microphone is available. Connect a microphone or keep typing.';
    case 'no-speech':
    case 'nomatch':
      return 'No speech was detected. Nothing was added; you can retry or keep typing.';
    case 'language-not-supported':
      return 'The selected speech language is not supported by this browser. Choose another language or keep typing.';
    case 'network':
      return 'The browser speech service could not be reached. Nothing was added; you can retry or keep typing.';
    case 'aborted':
      return 'Voice input was interrupted. Nothing was added; you can retry or keep typing.';
    case 'timeout':
      return 'Voice transcription timed out. Nothing was added; you can retry or keep typing.';
    default:
      return 'Voice transcription failed. Nothing was added; you can retry or keep typing.';
  }
}

function clampOffset(value, length) {
  if (!Number.isInteger(value)) return length;
  return Math.min(Math.max(value, 0), length);
}

function needsLeadingSpace(before, spokenText) {
  if (!before || /\s$/.test(before)) return false;
  if (/^[\s.,!?;:)\]}،؛؟]/.test(spokenText)) return false;
  return !/[([{]$/.test(before);
}

function needsTrailingSpace(spokenText, after) {
  if (!after || /^\s/.test(after)) return false;
  if (/^[.,!?;:)\]}،؛؟]/.test(after)) return false;
  return !/[([{]$/.test(spokenText);
}
