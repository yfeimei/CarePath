/**
 * Minimal typings + wrapper for the Web Speech API, which isn't in lib.dom.
 *
 * Speech is a convenience only. It is feature-detected, it never selects a
 * destination on its own, and every failure path falls through to the manual
 * search box that is always on screen.
 *
 * Privacy note: browser speech recognition may transmit audio to the browser
 * vendor's servers. The hospital must approve that before deployment — see
 * README.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function constructor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechAvailable(): boolean {
  return constructor() !== null;
}

export interface SpeechHandlers {
  onTranscript(text: string, isFinal: boolean): void;
  onError(message: string): void;
  onEnd(): void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Use the search box below.',
  'service-not-allowed': 'Speech recognition is unavailable on this device. Use the search box below.',
  'no-speech': "I didn't hear anything. Try again, or use the search box below.",
  'audio-capture': 'No microphone was found. Use the search box below.',
  network: 'Speech recognition needs a network connection. Use the search box below.',
};

export function startListening(handlers: SpeechHandlers): SpeechRecognitionLike | null {
  const Ctor = constructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let text = '';
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      text += result[0].transcript;
      if (result.isFinal) isFinal = true;
    }
    handlers.onTranscript(text.trim(), isFinal);
  };

  recognition.onerror = (event) => {
    handlers.onError(ERROR_MESSAGES[event.error] ?? 'Speech recognition failed. Use the search box below.');
  };

  recognition.onend = handlers.onEnd;

  try {
    recognition.start();
  } catch {
    handlers.onError('Could not start the microphone. Use the search box below.');
    return null;
  }
  return recognition;
}
