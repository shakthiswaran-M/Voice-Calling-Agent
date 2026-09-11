import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Volume2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { speechSynthesisService } from '../../lib/speechSynthesisService';
import { sendChatMessageStream, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import { useChatStore } from '../../store/useChatStore';
import { normalizeNetkathir } from '../../lib/utils';

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInContextRef = useRef<AudioContext | null>(null);
  const bargeInTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const welcomeTimerRef = useRef<number | null>(null);

  // Web Speech — runs in parallel during recording for live display + fallback
  const wsRecognitionRef = useRef<WSRecognition | null>(null);
  const wsFinalTextRef = useRef('');
  const wsActiveRef = useRef(false);
  const speechStateRef = useRef<SpeechState>('idle');
  const interruptionRef = useRef(false);
  const preferWebSpeechRef = useRef(false);
  const discardRecordingRef = useRef(false);

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
  const sttAbortControllerRef = useRef<AbortController | null>(null);
  const llmAbortControllerRef = useRef<AbortController | null>(null);
  const ttsAudioUrlRef = useRef<string | null>(null);
  const startListeningRef = useRef<(allowDuringSpeech?: boolean) => Promise<void>>(async () => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const voiceSessionActiveRef = useRef(false);
  const startBargeInMonitorRef = useRef<() => Promise<void>>(async () => {});

  // Chat store refs (avoid stale closures)
  const { activeThreadId, addMessage, createThread, setThreadSessionId } = useChatStore();
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  speechStateRef.current = state;
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
    if (!voiceSessionActiveRef.current) return;
    console.info('[Speech] State → error:', msg);
    processingRef.current = false;
    ttsSpeakingRef.current = false;
    ttsQueueRef.current = [];
    setErrorMessage(msg);
    setState('error');
  }, []);

  const stopBargeInMonitor = useCallback(() => {
    if (bargeInTimerRef.current !== null) {
      window.clearInterval(bargeInTimerRef.current);
      bargeInTimerRef.current = null;
    }
    void bargeInContextRef.current?.close();
    bargeInContextRef.current = null;
    bargeInStreamRef.current?.getTracks().forEach((track) => track.stop());
    bargeInStreamRef.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    turnIdRef.current += 1;
    processingRef.current = false;
    llmAbortControllerRef.current?.abort();
    llmAbortControllerRef.current = null;
    stopBargeInMonitor();
    ttsAbortControllerRef.current?.abort();
    ttsAbortControllerRef.current = null;
    speechSynthesisService.cancel();
    ttsAudioRef.current?.pause();
    if (ttsAudioRef.current) {
      ttsAudioRef.current.onended = null;
      ttsAudioRef.current.onerror = null;
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current.src = '';
    }
    ttsAudioRef.current = null;
    if (ttsAudioUrlRef.current) {
      URL.revokeObjectURL(ttsAudioUrlRef.current);
      ttsAudioUrlRef.current = null;
    }
    ttsSpeakingRef.current = false;
    ttsQueueRef.current = [];
    ttsBufferRef.current = '';
  }, [stopBargeInMonitor]);

  const interruptSpeaking = useCallback(() => {
    if (!voiceSessionActiveRef.current || speechStateRef.current !== 'speaking' || interruptionRef.current) return;
    interruptionRef.current = true;
    preferWebSpeechRef.current = true;
    console.info('[Speech] Interruption detected');
    stopSpeaking();
    setState('listening');
  }, [stopSpeaking]);

  const startBargeInMonitor = useCallback(async () => {
    if (!voiceSessionActiveRef.current || bargeInStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!voiceSessionActiveRef.current || !ttsSpeakingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      bargeInStreamRef.current = stream;
      bargeInContextRef.current = context;
      bargeInTimerRef.current = window.setInterval(() => {
        if (!voiceSessionActiveRef.current || !ttsSpeakingRef.current) {
          stopBargeInMonitor();
          return;
        }
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        if (Math.sqrt(sum / samples.length) > 0.055) {
          stopSpeaking();
          void startListeningRef.current();
        }
      }, 100);
    } catch {
      // Barge-in monitoring is optional; the Stop button remains available.
    }
  }, [stopBargeInMonitor, stopSpeaking]);

  // ── TTS: sentence-by-sentence with queue ──
  const speakSentence = useCallback((text: string, turnId: number, listenDuringSpeech = true) => {
    if (!text.trim() || !voiceSessionActiveRef.current || turnIdRef.current !== turnId) return;
    if (ttsSpeakingRef.current) {
      ttsQueueRef.current.push(text);
      return;
    }
    interruptionRef.current = false;
    ttsSpeakingRef.current = true;
    console.info('[Speech] State → speaking');
    setState('speaking');
    // Keep recognition and the recorder active while TTS plays. Web Speech
    // interim results provide the earliest browser-level barge-in signal.
    if (listenDuringSpeech) void startListeningRef.current(true);

    const finish = () => {
      stopBargeInMonitor();
      ttsSpeakingRef.current = false;
      ttsAudioRef.current = null;
      ttsAbortControllerRef.current = null;
      if (turnIdRef.current !== turnId) return;
      const next = ttsQueueRef.current.shift();
      if (next) {
        speakSentence(next, turnId);
      } else {
        if (speechStateRef.current === 'listening') return;
        if (mediaRecorderRef.current) discardRecordingRef.current = true;
        stopListeningRef.current();
        goToIdle();
        if (!listenDuringSpeech) {
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (voiceSessionActiveRef.current && turnIdRef.current === turnId) {
              void startListeningRef.current();
            }
          }, 0);
        }
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
        if (!voiceSessionActiveRef.current || turnIdRef.current !== turnId) return;
        const audioUrl = URL.createObjectURL(await response.blob());
        if (!voiceSessionActiveRef.current || turnIdRef.current !== turnId) {
          URL.revokeObjectURL(audioUrl);
          return;
        }
        const audio = new Audio(audioUrl);
        ttsAudioRef.current = audio;
        ttsAudioUrlRef.current = audioUrl;
        audio.onended = () => { URL.revokeObjectURL(audioUrl); finish(); };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          ttsAudioUrlRef.current = null;
          if (voiceSessionActiveRef.current) fallback();
        };
        await audio.play();
      } catch (error) {
        if (controller.signal.aborted || !voiceSessionActiveRef.current || turnIdRef.current !== turnId) return;
        console.warn('[Speech] ElevenLabs TTS failed:', error);
        fallback();
      }
    };

    void playElevenLabs();
  }, [goToIdle, stopBargeInMonitor]);

  startBargeInMonitorRef.current = startBargeInMonitor;

  // ── Stream chunk handler ──
  const handleStreamChunk = useCallback((chunk: string, turnId: number) => {
    if (!voiceSessionActiveRef.current || turnIdRef.current !== turnId) return;
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
      if (display) {
        const normalized = normalizeNetkathir(display);
        setTranscript(normalized);
        const meaningfulSpeech = normalized.replace(/[^\p{L}\p{N}]/gu, '').length >= 4;
        if (meaningfulSpeech && speechStateRef.current === 'speaking') interruptSpeaking();
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (wsActiveRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    try { rec.start(); wsRecognitionRef.current = rec; } catch { /* ignore */ }
  }, [interruptSpeaking]);

  const stopWsRecognition = useCallback(() => {
    wsActiveRef.current = false;
    const recognition = wsRecognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* ignore */ }
    }
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

  const stopVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;
    turnIdRef.current += 1;
    processingRef.current = false;

    if (welcomeTimerRef.current !== null) {
      window.clearTimeout(welcomeTimerRef.current);
      welcomeTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    stopListening();
    stopBargeInMonitor();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    llmAbortControllerRef.current?.abort();
    llmAbortControllerRef.current = null;
    sttAbortControllerRef.current?.abort();
    sttAbortControllerRef.current = null;
    stopSpeaking();
    speechSynthesisService.cancel();
    ttsSpeakingRef.current = false;
    ttsQueueRef.current = [];
    ttsBufferRef.current = '';
    streamBufferRef.current = '';
    setIsListening(false);
    setState('idle');
  }, [stopListening, stopBargeInMonitor, stopSpeaking]);

  // ── Process recording: STT → LLM → TTS ──
  // Uses a ref so MediaRecorder.onstop always calls the latest version.
  const processRecording = useCallback(async (audioBlob: Blob) => {
    if (!voiceSessionActiveRef.current) return;
    setIsListening(false);
    stopWsRecognition();
    console.info('[Speech] Stop listening');

    const wsText = normalizeNetkathir(wsFinalTextRef.current.trim());
    const useWebSpeech = preferWebSpeechRef.current;
    preferWebSpeechRef.current = false;
    if (wsText) setTranscript(wsText);

    console.info('[Speech] State → thinking');
    setState('thinking');
    processingRef.current = true;
    turnIdRef.current += 1;
    const currentTurn = turnIdRef.current;

    // ── STT: Sarvam primary, Web Speech fallback ──
    let finalText = '';
    const sttController = new AbortController();
    sttAbortControllerRef.current = sttController;
    try {
      console.info('[Speech] Trying Sarvam STT...');
      finalText = useWebSpeech && wsText
        ? wsText
        : normalizeNetkathir(await transcribeAudio(audioBlob, sttController.signal));
      console.info('[Speech] Sarvam transcript:', finalText);
    } catch (err) {
      if (sttController.signal.aborted || !voiceSessionActiveRef.current) return;
      console.warn('[Speech] Sarvam STT failed:', err);
      finalText = wsText;
      if (finalText) console.info('[Speech] Using Web Speech fallback:', finalText);
    }
    sttAbortControllerRef.current = null;

    if (!voiceSessionActiveRef.current || turnIdRef.current !== currentTurn) return;

    if (!finalText.trim()) {
      console.info('[Speech] No transcript — returning to idle');
      goToIdle();
      return;
    }

    finalText = normalizeNetkathir(finalText.trim());
    setTranscript(finalText);

    // Add user message to chat
    const threadId = activeThreadIdRef.current || createThreadRef.current().id;
    addMessageRef.current(threadId, { role: 'user', content: finalText.trim() });

    // ── Stream LLM ──
    console.info('[Speech] LLM started');
    streamBufferRef.current = '';
    ttsBufferRef.current = '';
    setResponseText('');

    try {
      const llmController = new AbortController();
      llmAbortControllerRef.current = llmController;
      const sessionId = useChatStore.getState().threads.find((t) => t.id === threadId)?.sessionId;
      const newSessionId = await sendChatMessageStream(
        finalText.trim(),
        (chunk) => handleStreamChunk(chunk, currentTurn),
        sessionId,
        llmController.signal,
      );
      llmAbortControllerRef.current = null;
      if (!voiceSessionActiveRef.current || turnIdRef.current !== currentTurn) return;
      if (newSessionId && !sessionId) setSessionRef.current(threadId, newSessionId);

      console.info('[Speech] LLM completed');

      // Flush remaining TTS buffer
      const remaining = ttsBufferRef.current.trim();
      ttsBufferRef.current = '';
      if (remaining) {
        speakSentence(remaining, currentTurn);
      } else if (!ttsSpeakingRef.current && ttsQueueRef.current.length === 0) {
        goToIdle();
      }

      // Add bot message to chat
      const fullResponse = streamBufferRef.current.trim();
      if (fullResponse) {
        addMessageRef.current(threadId, { role: 'bot', content: fullResponse });
      }
    } catch (err) {
      llmAbortControllerRef.current = null;
      if (!voiceSessionActiveRef.current || turnIdRef.current !== currentTurn) return;
      const msg = err instanceof ApiError ? err.message : 'Could not complete that request. Please try again.';
      console.warn('[Speech] LLM failed:', err);
      showError(msg);
    }
  }, [goToIdle, showError, stopWsRecognition, handleStreamChunk, speakSentence]);

  // Ref so MediaRecorder.onstop always calls the latest processRecording
  const processRecordingRef = useRef(processRecording);
  processRecordingRef.current = processRecording;

  // ── Start recording ──
  const startListening = useCallback(async (allowDuringSpeech = false) => {
    if (!voiceSessionActiveRef.current || (processingRef.current && !allowDuringSpeech) || isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!voiceSessionActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopListening();
        stream.getTracks().forEach((t) => t.stop());
        if (mediaStreamRef.current === stream) mediaStreamRef.current = null;
        if (!voiceSessionActiveRef.current || discardRecordingRef.current) {
          discardRecordingRef.current = false;
          return;
        }
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
        if (!voiceSessionActiveRef.current) {
          stopListening();
          return;
        }
        if (speechStateRef.current === 'speaking') return;
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
      if (!allowDuringSpeech) setState('listening');

      startWsRecognition();
    } catch (err) {
      console.warn('[Speech] Mic access denied:', err);
      showError('Microphone access was denied or unavailable.');
    }
  }, [isListening, showError, startWsRecognition, stopListening]);

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;

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
    stopVoiceSession();
  }, [stopVoiceSession]);

  // ── Open/close + welcome message ──
  useEffect(() => {
    if (!isOpen) {
      welcomeSpokenRef.current = false;
      stopVoiceSession();
      return;
    }
    voiceSessionActiveRef.current = true;
    turnIdRef.current += 1;
    goToIdle();

    if (welcomeSpokenRef.current) return;
    welcomeSpokenRef.current = true;

    welcomeTimerRef.current = window.setTimeout(() => {
      welcomeTimerRef.current = null;
      if (!voiceSessionActiveRef.current) return;
      const welcomeText = 'Welcome to Netkathir, how can I help you today?';
      const turn = turnIdRef.current;
      speakSentence(welcomeText, turn, false);
    }, 400);
    return () => {
      if (welcomeTimerRef.current !== null) {
        window.clearTimeout(welcomeTimerRef.current);
        welcomeTimerRef.current = null;
      }
    };
  }, [isOpen, goToIdle, speakSentence, stopVoiceSession]);

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
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500">Netkathir voice</span>
        <button type="button" onClick={() => { stopVoiceSession(); onClose(); }} aria-label="Close speech to speech" className={cn('rounded-full p-2 transition-colors', isDarkMode ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-midnight-400 hover:bg-green-100 hover:text-green-700')}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        <div
          className={cn('voice-orb relative mb-8 h-[76px] w-[76px] rounded-full sm:h-[88px] sm:w-[88px]', orbClass)}
          role="img"
          aria-label={`${statusText} orb`}
        />

        <div className={cn('voice-waveform mb-5', `voice-waveform-${state}`)} aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
        </div>

        <h1 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-4xl">Welcome to Netkathir.</h1>
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
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isDarkMode ? 'text-green-400/70' : 'text-green-600')}>Netkathir</span>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{errorMessage || responseText || (state === 'thinking' ? 'Processing...' : '')}</p>
              </div>
            )}
          </div>
        )}

        {state === 'speaking' && (
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              discardRecordingRef.current = true;
              stopListeningRef.current();
              interruptionRef.current = false;
              preferWebSpeechRef.current = false;
              setTranscript('');
              setState('idle');
            }}
            className="mt-5 flex items-center justify-center gap-2 rounded-full bg-red-500 px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-600 active:scale-95"
          >
            <MicOff className="h-4 w-4" />
            Stop
          </button>
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
