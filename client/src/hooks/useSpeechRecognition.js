import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpeechRecognitionErrorMessage,
  voiceSessionLock
} from '../components/voiceInputCore.js';

const MAX_RECORDING_MS = 60_000;
const TRANSCRIPTION_TIMEOUT_MS = 15_000;

export function useSpeechRecognition({ language, onTranscript }) {
  const ownerRef = useRef(Symbol('voice-input'));
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const finalTranscriptRef = useRef('');
  const canceledRef = useRef(false);
  const errorMessageRef = useRef('');
  const stopRequestedRef = useRef(false);
  const recordingTimerRef = useRef(null);
  const transcriptionTimerRef = useRef(null);
  const cancellationTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const [lockOwner, setLockOwner] = useState(voiceSessionLock.getOwner());
  const [interimTranscript, setInterimTranscript] = useState('');
  const [status, setStatus] = useState({
    phase: 'idle',
    message: 'Ready for multilingual voice-to-text.'
  });

  onTranscriptRef.current = onTranscript;

  const isSupported = Boolean(getSpeechRecognitionConstructor());
  const isLockedByOther = Boolean(lockOwner && lockOwner !== ownerRef.current);

  const clearTimers = useCallback(() => {
    window.clearTimeout(recordingTimerRef.current);
    window.clearTimeout(transcriptionTimerRef.current);
    window.clearTimeout(cancellationTimerRef.current);
    recordingTimerRef.current = null;
    transcriptionTimerRef.current = null;
    cancellationTimerRef.current = null;
  }, []);

  const releaseRecognition = useCallback((recognition) => {
    if (recognitionRef.current !== recognition) return;
    clearTimers();
    recognitionRef.current = null;
    stopRequestedRef.current = false;
    voiceSessionLock.release(ownerRef.current);
  }, [clearTimers]);

  const failTimedOutRecognition = useCallback((recognition) => {
    if (recognitionRef.current !== recognition) return;
    errorMessageRef.current = getSpeechRecognitionErrorMessage('timeout');
    detachRecognitionHandlers(recognition);
    try {
      recognition.abort();
    } catch {
      // The recognition service may already be disconnected.
    }
    releaseRecognition(recognition);
    if (mountedRef.current) {
      setInterimTranscript('');
      setStatus({ phase: 'error', message: errorMessageRef.current });
    }
  }, [releaseRecognition]);

  const requestStop = useCallback((recognition, message = 'Transcribing speech...') => {
    if (recognitionRef.current !== recognition || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    if (mountedRef.current) {
      setStatus({ phase: 'transcribing', message });
    }

    try {
      recognition.stop();
    } catch {
      failTimedOutRecognition(recognition);
      return;
    }

    if (recognitionRef.current === recognition) {
      transcriptionTimerRef.current = window.setTimeout(
        () => failTimedOutRecognition(recognition),
        TRANSCRIPTION_TIMEOUT_MS
      );
    }
  }, [failTimedOutRecognition]);

  const start = useCallback(() => {
    const RecognitionConstructor = getSpeechRecognitionConstructor();
    if (!RecognitionConstructor) {
      setStatus({
        phase: 'error',
        message: 'Voice input is not supported in this browser. Typing remains available.'
      });
      return false;
    }

    if (recognitionRef.current) return false;
    if (!voiceSessionLock.acquire(ownerRef.current)) {
      setStatus({
        phase: 'error',
        message: 'Another field is using voice input. Stop or cancel it before starting here.'
      });
      return false;
    }

    let recognition;
    try {
      recognition = new RecognitionConstructor();
    } catch {
      voiceSessionLock.release(ownerRef.current);
      setStatus({ phase: 'error', message: getSpeechRecognitionErrorMessage() });
      return false;
    }
    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    canceledRef.current = false;
    errorMessageRef.current = '';
    stopRequestedRef.current = false;
    setInterimTranscript('');
    setStatus({ phase: 'requesting', message: 'Requesting microphone access...' });

    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!mountedRef.current || recognitionRef.current !== recognition) return;
      setStatus({ phase: 'recording', message: 'Listening... Speak in the selected language.' });
      recordingTimerRef.current = window.setTimeout(
        () => requestStop(recognition, 'Recording limit reached. Transcribing speech...'),
        MAX_RECORDING_MS
      );
    };

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = event.results[index]?.[0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalTranscriptRef.current = joinTranscriptChunks(finalTranscriptRef.current, chunk);
        } else {
          interim = joinTranscriptChunks(interim, chunk);
        }
      }
      if (mountedRef.current) setInterimTranscript(interim.trim());
    };

    recognition.onnomatch = () => {
      errorMessageRef.current = getSpeechRecognitionErrorMessage('nomatch');
    };

    recognition.onerror = (event) => {
      if (canceledRef.current && event.error === 'aborted') return;
      errorMessageRef.current = getSpeechRecognitionErrorMessage(event.error);
      if (mountedRef.current) {
        setStatus({ phase: 'error', message: errorMessageRef.current });
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      const wasCanceled = canceledRef.current;
      const errorMessage = errorMessageRef.current;
      const transcript = finalTranscriptRef.current.trim();
      releaseRecognition(recognition);
      if (!mountedRef.current) return;

      setInterimTranscript('');
      if (wasCanceled) {
        setStatus({ phase: 'canceled', message: 'Recording canceled. Nothing was added.' });
        return;
      }
      if (errorMessage) {
        setStatus({ phase: 'error', message: errorMessage });
        return;
      }
      if (!transcript) {
        setStatus({ phase: 'error', message: getSpeechRecognitionErrorMessage('no-speech') });
        return;
      }

      onTranscriptRef.current?.(transcript);
      setStatus({ phase: 'success', message: 'Transcript added. You can edit it before saving.' });
    };

    try {
      recognition.start();
      return true;
    } catch (error) {
      detachRecognitionHandlers(recognition);
      releaseRecognition(recognition);
      const errorCode = error?.name === 'NotAllowedError' ? 'not-allowed' : undefined;
      setStatus({ phase: 'error', message: getSpeechRecognitionErrorMessage(errorCode) });
      return false;
    }
  }, [language, releaseRecognition, requestStop]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    requestStop(recognition);
  }, [requestStop]);

  const cancel = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    canceledRef.current = true;
    clearTimers();
    if (mountedRef.current) {
      setInterimTranscript('');
      setStatus({ phase: 'canceled', message: 'Recording canceled. Nothing was added.' });
    }
    try {
      recognition.abort();
      cancellationTimerRef.current = window.setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        detachRecognitionHandlers(recognition);
        releaseRecognition(recognition);
      }, 1_000);
    } catch {
      releaseRecognition(recognition);
    }
  }, [clearTimers, releaseRecognition]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = voiceSessionLock.subscribe(setLockOwner);
    return () => {
      mountedRef.current = false;
      unsubscribe();
      const recognition = recognitionRef.current;
      if (recognition) {
        canceledRef.current = true;
        clearTimers();
        detachRecognitionHandlers(recognition);
        try {
          recognition.abort();
        } catch {
          // The recognition service may already be disconnected.
        }
        releaseRecognition(recognition);
      } else {
        voiceSessionLock.release(ownerRef.current);
      }
    };
  }, [clearTimers, releaseRecognition]);

  return {
    cancel,
    interimTranscript,
    isActive: ['requesting', 'recording', 'transcribing'].includes(status.phase),
    isLockedByOther,
    isSupported,
    start,
    status,
    stop
  };
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function detachRecognitionHandlers(recognition) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onnomatch = null;
  recognition.onerror = null;
  recognition.onend = null;
}

function joinTranscriptChunks(current, next) {
  const currentText = String(current || '').trim();
  const nextText = String(next || '').trim();
  if (!currentText) return nextText;
  if (!nextText) return currentText;
  return `${currentText} ${nextText}`;
}
