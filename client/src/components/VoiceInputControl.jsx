import { LoaderCircle, Mic, ShieldCheck, Square, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';
import {
  DEFAULT_VOICE_LANGUAGE,
  insertTranscriptAtSelection,
  VOICE_LANGUAGES
} from './voiceInputCore.js';

export function VoiceInputControl({ textareaRef, value, onChange, fieldLabel, disabled = false }) {
  const [language, setLanguage] = useState(DEFAULT_VOICE_LANGUAGE);
  const selectionRef = useRef({ start: String(value || '').length, end: String(value || '').length });

  const handleTranscript = useCallback((transcript) => {
    const textarea = textareaRef.current;
    const currentValue = textarea?.value ?? value ?? '';
    const insertion = insertTranscriptAtSelection(
      currentValue,
      transcript,
      selectionRef.current.start,
      selectionRef.current.end
    );

    onChange(insertion.value);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(insertion.selectionStart, insertion.selectionEnd);
    });
  }, [onChange, textareaRef, value]);

  const {
    cancel,
    interimTranscript,
    isActive,
    isLockedByOther,
    isSupported,
    start,
    status,
    stop
  } = useSpeechRecognition({ language, onTranscript: handleTranscript });

  const isTranscribing = status.phase === 'transcribing';
  const statusMessage = getVisibleStatusMessage({ disabled, isLockedByOther, isSupported, status });

  function startFromCurrentSelection() {
    const textarea = textareaRef.current;
    const fallback = String(value || '').length;
    const insertionPoint = textarea?.selectionStart ?? fallback;
    selectionRef.current = {
      start: insertionPoint,
      end: insertionPoint
    };
    start();
  }

  return (
    <div className="voice-input-control" data-phase={status.phase}>
      <div className="voice-input-toolbar">
        <label className="voice-language-field">
          <span>Speech language</span>
          <select
            aria-label={`Speech language for ${fieldLabel}`}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={disabled || isActive || isLockedByOther}>
            {VOICE_LANGUAGES.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="voice-input-buttons" aria-label={`Voice controls for ${fieldLabel}`}>
          {isActive ? (
            <>
              <button
                className={`voice-icon-button ${status.phase === 'recording' ? 'recording' : ''}`}
                type="button"
                aria-label="Stop recording and transcribe"
                title="Stop recording and transcribe"
                onClick={stop}
                disabled={isTranscribing}>
                {isTranscribing ? <LoaderCircle className="voice-spinner" size={19} /> : <Square size={18} />}
              </button>
              <button
                className="voice-icon-button cancel"
                type="button"
                aria-label="Cancel recording"
                title="Cancel recording"
                onClick={cancel}>
                <X size={20} />
              </button>
            </>
          ) : (
            <button
              className="voice-icon-button"
              type="button"
              aria-label={`Start voice input for ${fieldLabel}`}
              title="Start voice input"
              onClick={startFromCurrentSelection}
              disabled={disabled || !isSupported || isLockedByOther}>
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="voice-status" data-phase={status.phase} role="status" aria-live="polite">
        <span>{statusMessage}</span>
        {interimTranscript ? <span className="voice-interim" dir="auto">{interimTranscript}</span> : null}
      </div>

      <p className="voice-privacy-notice">
        <ShieldCheck size={15} aria-hidden="true" />
        Speech recognition may be processed by your browser provider. Smart Day Planner does not store audio.
      </p>
    </div>
  );
}

function getVisibleStatusMessage({ disabled, isLockedByOther, isSupported, status }) {
  if (disabled) return 'Voice input is unavailable here. Typing remains available.';
  if (!isSupported) return 'Voice input is not supported in this browser. Typing remains available.';
  if (isLockedByOther) return 'Voice input is active in another field.';
  return status.message;
}
