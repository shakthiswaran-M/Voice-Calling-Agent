import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Volume2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { speechSynthesisService } from '../../lib/speechSynthesisService';
import { sendChatMessageStream, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import { useChatStore } from '../../store/useChatStore';

type SpeechState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface SpeechToSpeechModeProps {
  isOpen: boolean;
  disabled?: boolean;
  isDarkMode?: boolean;
  onClose: () => void;
}

// ── Web Speech API types ──
type WSResult = { isFinal: boolean; 0: { transcript: string } };
type WSEvent = Event & { resultIndex: number; results: ArrayLike<WSResult> };
type WSErrorEvent = Event & { error: string };
interface WSRecognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onerror: ((e: WSErrorEvent) => void) | null;
  onresult: ((e: WSEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type WSW = Window & {
  SpeechRecognition?: new () => WSRecognition;
  webkitSpeechRecognition?: new () => WSRecognition;
};

export function SpeechToSpeechMode({
  isOpen, disabled = false, isDarkMode = false, onClose,
}: SpeechToSpeechModeProps) {
  const [state, setState] = useState<SpeechState>('idle');
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isListening, setIsListening] = useState(false);

  // ── Refs ──
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<number | null>(null);

  // Web Speech — runs in parallel during recording for live display + fallback
  const wsRecognitionRef = useRef<WSRecognition | null>(null);
  const wsFinalTextRef = useRef('');
  const wsActiveRef = useRef(false);

  // LLM streaming
  const streamBufferRef = useRef('');
  const ttsBufferRef = useRef('');
  const ttsSpeakingRef = useRef(false);
  const ttsQueueRef = useRef<string[]>([]);
  const turnIdRef = useRef(0);
  const processingRef = useRef(false);
  const welcomeSpokenRef = useRef(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});

  // Chat store refs (avoid stale closures)
  const { activeThreadId, addMessage, createThread, setThreadSessionId } = useChatStore();
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const createThreadRef = useRef(createThread);
  createThreadRef.current = createThread;
  const setSessionRef = useRef(setThreadSessionId);
  setSessionRef.current = setThreadSessionId;

  // ── State transitions ──
  const goToIdle = useCallback(() => {
    console.info('[Speech] State → idle');
    setState('idle');
    setTranscript('');
    setResponseText('');
    setErrorMessage('');
    processingRef.current = false;
    streamBufferRef.current = '';
    ttsBufferRef.current = '';
    ttsSpeakingRef.current = false;
    ttsQueueRef.current = [];
  }, []);

  const showError = useCallback((msg: string) => {
    console.info('[Speech] State → error:', msg);
    processingRef.current = false;
    ttsSpeakingRef.current = false;
    ttsQueueRef.current = [];
    setErrorMessage(msg);
    setState('error');
  }, []);

  // ── TTS: sentence-by-sentence with queue ──
  const speakSentence = useCallback((text: string, turnId: number) => {
    if (!text.trim()) return;
    if (ttsSpeakingRef.current) {
      ttsQueueRef.current.push(text);
      return;
    }
    ttsSpeakingRef.current = true;
    console.info('[Speech] State → speaking');
    setState('speaking');

    const finish = () => {
      ttsSpeakingRef.current = false;
      ttsAudioRef.current = null;
      ttsAbortControllerRef.current = null;
      if (turnIdRef.current !== turnId) return;
      const next = ttsQueueRef.current.shift();
      if (next) {
        speakSentence(next, turnId);
      } else {
        goToIdle();
        window.setTimeout(() => { void startListeningRef.current(); }, 0);
      }
    };

    const fallback = () => {
      if (!('speechSynthesis' in window)) { finish(); return; }
      speechSynthesisService.speak(text, {
        onstart: () => console.info('[Speech] Browser TTS fallback started'),
        onend: finish,
        onerror: finish,
      });
    };

    const playElevenLabs = async () => {
      const controller = new AbortController();
      ttsAbortControllerRef.current = controller;
      try {
        const response = await synthesizeSpeech(text, controller.signal);
        if (turnIdRef.current !== turnId) return;
        const audioUrl = URL.createObjectURL(await response.blob());
        const audio = new Audio(audioUrl);
        ttsAudioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(audioUrl); finish(); };
        audio.onerror = () => { URL.revokeObjectURL(audioUrl); fallback(); };
        await audio.play();
      } catch (error) {
        if (controller.signal.aborted || turnIdRef.current !== turnId) return;
        console.warn('[Speech] ElevenLabs TTS failed:', error);
        fallback();
      }
    };

    void playElevenLabs();
  }, [goToIdle]);

  // ── Stream chunk handler ──
  const handleStreamChunk = useCallback((chunk: string, turnId: number) => {
    if (turnIdRef.current !== turnId) return;
    streamBufferRef.current += chunk;
    setResponseText(streamBufferRef.current);

    ttsBufferRef.current += chunk;
    const match = ttsBufferRef.current.match(/^(.*?[.!?。！？])\s/);
    if (match) {
      const sentence = match[1].trim();
      ttsBufferRef.current = ttsBufferRef.current.slice(match[0].length);
      speakSentence(sentence, turnId);
    }
  }, [speakSentence]);

  // ── Web Speech: start/stop for live transcript ──
  const startWsRecognition = useCallback(() => {
    const Ctor = (window as WSW).SpeechRecognition || (window as WSW).webkitSpeechRecognition;
    if (!Ctor) return;

    wsFinalTextRef.current = '';
    wsActiveRef.current = true;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onresult = (event) => {
      if (!wsActiveRef.current) return;
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (final) wsFinalTextRef.current += final;
      const display = [wsFinalTextRef.current, interim].filter(Boolean).join(' ').trim();
      if (display) setTranscript(display);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (wsActiveRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    try { rec.start(); wsRecognitionRef.current = rec; } catch { /* ignore */ }
  }, []);

  const stopWsRecognition = useCallback(() => {
    wsActiveRef.current = false;
    try { wsRecognitionRef.current?.stop(); } catch { /* ignore */ }
    wsRecognitionRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    stopWsRecognition();
  }, [stopWsRecognition]);

  // ── Process recording: STT → LLM → TTS ──
  // Uses a ref so MediaRecorder.onstop always calls the latest version.
  const processRecording = useCallback(async (audioBlob: Blob) => {
    setIsListening(false);
    stopWsRecognition();
    console.info('[Speech] Stop listening');

    const wsText = wsFinalTextRef.current.trim();
    if (wsText) setTranscript(wsText);

    console.info('[Speech] State → thinking');
    setState('thinking');
    processingRef.current = true;
    turnIdRef.current += 1;
    const currentTurn = turnIdRef.current;

    // ── STT: Sarvam primary, Web Speech fallback ──
    let finalText = '';
    try {
      console.info('[Speech] Trying Sarvam STT...');
      finalText = await transcribeAudio(audioBlob);
      console.info('[Speech] Sarvam transcript:', finalText);
    } catch (err) {
      console.warn('[Speech] Sarvam STT failed:', err);
      finalText = wsText;
      if (finalText) console.info('[Speech] Using Web Speech fallback:', finalText);
    }

    if (!finalText.trim()) {
      console.info('[Speech] No transcript — returning to idle');
      goToIdle();
      window.setTimeout(() => { void startListeningRef.current(); }, 0);
      return;
    }

    setTranscript(finalText.trim());

    // Add user message to chat
    const threadId = activeThreadIdRef.current || createThreadRef.current().id;
    addMessageRef.current(threadId, { role: 'user', content: finalText.trim() });

    // ── Stream LLM ──
    console.info('[Speech] LLM started');
    streamBufferRef.current = '';
    ttsBufferRef.current = '';
    setResponseText('');

    try {
      const sessionId = useChatStore.getState().threads.find((t) => t.id === threadId)?.sessionId;
      const newSessionId = await sendChatMessageStream(
        finalText.trim(),
        (chunk) => handleStreamChunk(chunk, currentTurn),
        sessionId,
      );
      if (turnIdRef.current !== currentTurn) return;
      if (newSessionId && !sessionId) setSessionRef.current(threadId, newSessionId);

      console.info('[Speech] LLM completed');

      // Flush remaining TTS buffer
      const remaining = ttsBufferRef.current.trim();
      ttsBufferRef.current = '';
      if (remaining) {
        speakSentence(remaining, currentTurn);
      } else if (!ttsSpeakingRef.current && ttsQueueRef.current.length === 0) {
        goToIdle();
        window.setTimeout(() => { void startListeningRef.current(); }, 0);
      }

      // Add bot message to chat
      const fullResponse = streamBufferRef.current.trim();
      if (fullResponse) {
        addMessageRef.current(threadId, { role: 'bot', content: fullResponse });
      }
    } catch (err) {
      if (turnIdRef.current !== currentTurn) return;
      const msg = err instanceof ApiError ? err.message : 'Could not complete that request. Please try again.';
      console.warn('[Speech] LLM failed:', err);
      showError(msg);
    }
  }, [goToIdle, showError, stopWsRecognition, handleStreamChunk, speakSentence]);

  // Ref so MediaRecorder.onstop always calls the latest processRecording
  const processRecordingRef = useRef(processRecording);
  processRecordingRef.current = processRecording;

  // ── Start recording ──
  const startListening = useCallback(async () => {
    if (processingRef.current || isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopListening();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        void processRecordingRef.current(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let speechDetected = false;
      let silenceStartedAt: number | null = null;
      audioContextRef.current = audioContext;
      silenceTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const volume = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (volume > 0.025) {
          speechDetected = true;
          silenceStartedAt = null;
        } else if (speechDetected) {
          silenceStartedAt ??= now;
          if (now - silenceStartedAt >= 1200) stopListening();
        } else if (now - startedAt >= 15000) {
          stopListening();
        }
      }, 100);
      setIsListening(true);
      console.info('[Speech] Start listening');
      setState('listening');

      startWsRecognition();
    } catch (err) {
      console.warn('[Speech] Mic access denied:', err);
      showError('Microphone access was denied or unavailable.');
    }
  }, [isListening, showError, startWsRecognition, stopListening]);

  startListeningRef.current = startListening;

  // ── Toggle button ──
  const handleToggle = useCallback(() => {
    if (state === 'listening') {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      stopWsRecognition();
    } else if (state === 'idle' && !disabled) {
      startListening();
    }
  }, [state, disabled, startListening, stopWsRecognition]);

  // ── Cleanup on unmount ──
  useEffect(() => () => {
    turnIdRef.current += 1;
    speechSynthesisService.cancel();
    ttsAbortControllerRef.current?.abort();
    ttsAudioRef.current?.pause();
    ttsAudioRef.current = null;
    stopListening();
  }, [stopListening]);

  // ── Open/close + welcome message ──
  useEffect(() => {
    if (!isOpen) {
      welcomeSpokenRef.current = false;
      turnIdRef.current += 1;
      speechSynthesisService.cancel();
      ttsAbortControllerRef.current?.abort();
      ttsAudioRef.current?.pause();
      ttsAudioRef.current = null;
      stopListening();
      return;
    }
    goToIdle();

    if (welcomeSpokenRef.current) return;
    welcomeSpokenRef.current = true;

    const timer = setTimeout(() => {
      const welcomeText = 'Welcome to Netkathir, how can I help you today?';
      const turn = turnIdRef.current;
      speakSentence(welcomeText, turn);
    }, 400);
    return () => clearTimeout(timer);
  }, [isOpen, goToIdle, speakSentence, stopListening]);

  if (!isOpen) return null;

  // ── UI ──
  const isActive = state !== 'idle';
  const statusText =
    state === 'listening' ? 'Listening' :
    state === 'thinking' ? 'Thinking...' :
    state === 'speaking' ? 'Speaking...' :
    state === 'error' ? 'Something went wrong' :
    'Speech to speech';

  const orbClass =
    state === 'listening' ? 'voice-orb-listening' :
    state === 'thinking' ? 'voice-orb-thinking' :
    state === 'speaking' ? 'voice-orb-speaking' :
    'voice-orb-idle';

  return (
    <div className={cn('fixed inset-0 z-[70] flex flex-col', isDarkMode ? 'bg-[#050806] text-white' : 'bg-[#f8fcf5] text-midnight-900')}>
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500">NetKathir voice</span>
        <button type="button" onClick={onClose} aria-label="Close speech to speech" className={cn('rounded-full p-2 transition-colors', isDarkMode ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-midnight-400 hover:bg-green-100 hover:text-green-700')}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        <div
          className={cn('voice-orb relative mb-8 h-[76px] w-[76px] rounded-full sm:h-[88px] sm:w-[88px]', orbClass)}
          role="img"
          aria-label={`${statusText} orb`}
        />

        <h1 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-4xl">Welcome to NetKathir.</h1>
        <p className={cn('mt-2 max-w-xl text-base sm:text-lg', isDarkMode ? 'text-white/60' : 'text-midnight-500')}>
          {state === 'idle' || state === 'error' ? 'How can I help you?' : statusText}
        </p>

        {(isActive || transcript || responseText || errorMessage) && (
          <div className="mt-7 w-full max-w-xl space-y-3">
            {/* User transcript */}
            {transcript && (
              <div className={cn('rounded-2xl border px-4 py-3 text-left text-sm', isDarkMode ? 'border-white/10 bg-white/[0.04] text-white/75' : 'border-green-200 bg-white/80 text-midnight-700')}>
                <div className="mb-1 flex items-center gap-2 font-medium">
                  {state === 'listening' && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isDarkMode ? 'text-green-400/70' : 'text-green-600')}>You</span>
                </div>
                <p className="leading-relaxed">{transcript}</p>
              </div>
            )}

            {/* Bot response */}
            {(responseText || state === 'thinking' || state === 'speaking') && (
              <div className={cn('rounded-2xl border px-4 py-3 text-left text-sm', isDarkMode ? 'border-white/10 bg-white/[0.04] text-white/75' : 'border-green-200 bg-white/80 text-midnight-700')}>
                <div className="mb-1 flex items-center gap-2 font-medium">
                  {state === 'thinking' && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {state === 'speaking' && <Volume2 className="h-4 w-4 text-green-500" />}
                  {state === 'error' && <span className="text-red-500">Error</span>}
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isDarkMode ? 'text-green-400/70' : 'text-green-600')}>NetKathir</span>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{errorMessage || responseText || (state === 'thinking' ? 'Processing...' : '')}</p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled || state === 'thinking' || state === 'speaking'}
          className={cn(
            'mt-8 flex min-w-52 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-all active:scale-95',
            state === 'listening'
              ? 'bg-red-500 text-white hover:bg-red-600'
              : isDarkMode
                ? 'bg-green-400 text-black hover:bg-green-300'
                : 'bg-green-600 text-white hover:bg-green-700',
            (disabled || state === 'thinking' || state === 'speaking') && 'cursor-not-allowed opacity-50',
          )}
        >
          {state === 'listening' ? <MicOff className="h-4 w-4" /> : state === 'thinking' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {state === 'listening' ? 'Pause listening' : state === 'thinking' ? 'Thinking...' : state === 'speaking' ? 'Speaking...' : state === 'error' ? 'Try again' : 'Start Conversation'}
        </button>
      </div>
    </div>
  );
}
