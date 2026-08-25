import { useCallback, useEffect, useRef, useState } from 'react';

type RecognitionEvent = Event & { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>; resultIndex: number };
type RecognitionErrorEvent = Event & { error: string };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

declare global { interface Window { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } }

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const callbackRef = useRef(onFinal);
  callbackRef.current = onFinal;
  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) { setError('SPEECH_NOT_SUPPORTED'); return; }
    setError(null);
    const recognition = new Constructor();
    recognition.lang = 'es-AR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) callbackRef.current(finalText.trim());
    };
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'MICROPHONE_DENIED' : 'SPEECH_ERROR');
      setIsListening(false);
    };
    recognition.onend = () => { setIsListening(false); setInterimTranscript(''); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  return { supported, isListening, interimTranscript, error, start, stop, fallback: 'audio-gemini-ready' as const };
}
