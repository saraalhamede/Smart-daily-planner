import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVoiceSessionLock,
  DEFAULT_VOICE_LANGUAGE,
  getSpeechRecognitionErrorMessage,
  insertTranscriptAtSelection,
  VOICE_LANGUAGES
} from './voiceInputCore.js';

test('uses English by default and exposes Arabic and Hebrew language hints', () => {
  assert.equal(DEFAULT_VOICE_LANGUAGE, 'en-US');
  assert.deepEqual(
    VOICE_LANGUAGES.map((language) => language.value),
    ['en-US', 'ar-SA', 'he-IL']
  );
});

test('appends dictated text without deleting existing text', () => {
  const result = insertTranscriptAtSelection('Existing task note', 'new dictated text', 18, 18);
  assert.equal(result.value, 'Existing task note new dictated text');
  assert.equal(result.selectionStart, result.value.length);
});

test('inserts dictated text at the cursor with natural spacing', () => {
  const result = insertTranscriptAtSelection('Plan today', 'the project', 4, 4);
  assert.equal(result.value, 'Plan the project today');
  assert.equal(result.value.slice(result.selectionStart), ' today');
});

test('preserves Arabic and Hebrew transcripts without translation', () => {
  const arabic = insertTranscriptAtSelection('ملاحظة', 'أشعر بطاقة جيدة', 7, 7);
  const hebrew = insertTranscriptAtSelection('', 'אני מרגישה טוב', 0, 0);
  assert.equal(arabic.value, 'ملاحظة أشعر بطاقة جيدة');
  assert.equal(hebrew.value, 'אני מרגישה טוב');
});

test('replaces only the selected range and keeps surrounding text', () => {
  const result = insertTranscriptAtSelection('Before old after', 'جديد', 7, 10);
  assert.equal(result.value, 'Before جديد after');
});

test('does not change the field for an empty transcript', () => {
  const result = insertTranscriptAtSelection('Keep this text', '   ', 4, 8);
  assert.equal(result.value, 'Keep this text');
});

test('provides actionable messages for permission, microphone, no-speech, and timeout errors', () => {
  assert.match(getSpeechRecognitionErrorMessage('not-allowed'), /permission was denied/i);
  assert.match(getSpeechRecognitionErrorMessage('audio-capture'), /no microphone/i);
  assert.match(getSpeechRecognitionErrorMessage('no-speech'), /no speech/i);
  assert.match(getSpeechRecognitionErrorMessage('timeout'), /timed out/i);
});

test('allows only one active voice session and notifies controls when the lock changes', () => {
  const lock = createVoiceSessionLock();
  const firstOwner = Symbol('first');
  const secondOwner = Symbol('second');
  const observedOwners = [];
  const unsubscribe = lock.subscribe((owner) => observedOwners.push(owner));

  assert.equal(lock.acquire(firstOwner), true);
  assert.equal(lock.acquire(secondOwner), false);
  assert.equal(lock.getOwner(), firstOwner);
  assert.equal(lock.release(secondOwner), false);
  assert.equal(lock.release(firstOwner), true);
  assert.equal(lock.acquire(secondOwner), true);
  unsubscribe();

  assert.deepEqual(observedOwners, [firstOwner, null, secondOwner]);
});
