import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, LoaderCircle, Mic, MicOff, Volume2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { speechSynthesisService } from '../../lib/speechSynthesisService';
import {
  sendChatMessageStream,
  transcribeAudio,
  synthesizeSpeech,
  ApiError,
} from '../../lib/api';
import { useChatStore } from '../../store/useChatStore';
import { normalizeNetkathir } from '../../lib/utils';

/**
 * Speech-to-Speech state machine
 *
 * idle
 *   ↓ Start Conversation
 * listening
 *   ↓ silence / max duration
 * thinking
 *   ↓ LLM response
 * speaking
 *   ↓ TTS finished
 * listening
 *
 * Stop button while speaking:
 *
 * speaking
 *   ↓ Stop
 * listening
 *
 * Two microphone pipelines:
 *
 * 1. MediaRecorder
 *    → records audio
 *    → Sarvam STT
 *    → final transcript
 *
 * 2. Web Speech API
 *    → interim results
 *    → live transcript shown in UI
 *
 * Web Speech API is only responsible for live captions/fallback.
 * Sarvam remains the primary final STT.
 */

type SpeechState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

interface SpeechToSpeechModeProps {
  isOpen: boolean;
  disabled?: boolean;
  isDarkMode?: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Speech API types
// ─────────────────────────────────────────────────────────────────────────────

type WSResult = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type WSEvent = Event & {
  resultIndex: number;
  results: ArrayLike<WSResult>;
};

type WSErrorEvent = Event & {
  error: string;
};

interface WSRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;

  onerror: ((event: WSErrorEvent) => void) | null;
  onresult: ((event: WSEvent) => void) | null;
  onend: (() => void) | null;

  start: () => void;
  stop: () => void;
  abort: () => void;
}

type WSW = Window & {
  SpeechRecognition?: new () => WSRecognition;
  webkitSpeechRecognition?: new () => WSRecognition;
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SPEECH_VOLUME_THRESHOLD = 0.045;
const SILENCE_VOLUME_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 800;
const MAX_LISTEN_MS = 15000;

const VOLUME_POLL_INTERVAL_MS = 100;

const MEANINGFUL_SPEECH_MIN_CHARS = 4;

const WELCOME_DELAY_MS = 400;

const WELCOME_TEXT =
  'Hi! I’m Netiva, your AI assistant from Netkathir Technologies. How can I help you today?';

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Volume meter
// ─────────────────────────────────────────────────────────────────────────────

function createVolumeMeter(stream: MediaStream) {
  const context = new AudioContext();

  const analyser = context.createAnalyser();

  analyser.fftSize = 512;

  context.createMediaStreamSource(stream).connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);

  return {
    getVolume(): number {
      analyser.getByteTimeDomainData(samples);

      let sumSquares = 0;

      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }

      return Math.sqrt(sumSquares / samples.length);
    },

    close() {
      void context.close();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SpeechToSpeechMode({
  isOpen,
  disabled = false,
  isDarkMode = false,
  onClose,
}: SpeechToSpeechModeProps) {
  const [state, setState] = useState<SpeechState>('idle');

  const [transcript, setTranscript] = useState('');

  const [responseText, setResponseText] = useState('');

  const [errorMessage, setErrorMessage] = useState('');

  const [isListening, setIsListening] = useState(false);

  const [isResponseAtBottom, setIsResponseAtBottom] = useState(true);

  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Media / audio refs
  // ───────────────────────────────────────────────────────────────────────────

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);

  const mediaStreamRef = useRef<MediaStream | null>(null);

  const silenceMeterRef =
    useRef<ReturnType<typeof createVolumeMeter> | null>(null);

  const silenceTimerRef = useRef<number | null>(null);

  const speechDetectedRef = useRef(false);

  const currentSpeakingTextRef = useRef('');

  const bargeInMeterRef =
    useRef<ReturnType<typeof createVolumeMeter> | null>(null);

  const bargeInStreamRef = useRef<MediaStream | null>(null);

  const bargeInTimerRef = useRef<number | null>(null);

  const restartTimerRef = useRef<number | null>(null);

  const welcomeTimerRef = useRef<number | null>(null);

  const responseContainerRef = useRef<HTMLDivElement | null>(null);

  const isResponseAtBottomRef = useRef(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Web Speech API refs
  // ───────────────────────────────────────────────────────────────────────────

  const wsRecognitionRef = useRef<WSRecognition | null>(null);

  const wsFinalTextRef = useRef('');

  const wsInterimTextRef = useRef('');

  const wsActiveRef = useRef(false);

  const wsStartingRef = useRef(false);

  const wsRestartTimerRef = useRef<number | null>(null);

  const speechStateRef = useRef<SpeechState>('idle');

  const interruptionRef = useRef(false);

  const preferWebSpeechRef = useRef(false);

  // ───────────────────────────────────────────────────────────────────────────
  // LLM / TTS refs
  // ───────────────────────────────────────────────────────────────────────────

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

  const voiceSessionActiveRef = useRef(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Latest callback refs
  // ───────────────────────────────────────────────────────────────────────────

  const startListeningRef = useRef<
    (allowDuringSpeech?: boolean) => Promise<void>
  >(async () => {});

  const stopListeningRef = useRef<() => void>(() => {});

  const processRecordingRef = useRef<(audioBlob: Blob) => Promise<void>>(
    async () => {},
  );

  const interruptThinkingRef = useRef<() => void>(() => {});

  const startWsRecognitionRef = useRef<() => void>(() => {});

  // ───────────────────────────────────────────────────────────────────────────
  // Chat store
  // ───────────────────────────────────────────────────────────────────────────

  const {
    activeThreadId,
    addMessage,
    createThread,
    setThreadSessionId,
  } = useChatStore();

  const activeThreadIdRef = useRef(activeThreadId);

  activeThreadIdRef.current = activeThreadId;

  const addMessageRef = useRef(addMessage);

  addMessageRef.current = addMessage;

  const createThreadRef = useRef(createThread);

  createThreadRef.current = createThread;

  const setSessionRef = useRef(setThreadSessionId);

  setSessionRef.current = setThreadSessionId;

  speechStateRef.current = state;

  // ───────────────────────────────────────────────────────────────────────────
  // Stop Web Speech recognition
  // ───────────────────────────────────────────────────────────────────────────

  const stopWsRecognition = useCallback(() => {
    wsActiveRef.current = false;

    wsStartingRef.current = false;

    if (wsRestartTimerRef.current !== null) {
      window.clearTimeout(wsRestartTimerRef.current);

      wsRestartTimerRef.current = null;
    }

    const recognition = wsRecognitionRef.current;

    if (recognition) {
      recognition.onresult = null;

      recognition.onerror = null;

      recognition.onend = null;

      try {
        recognition.abort();
      } catch {
        // Ignore browser-specific abort errors.
      }
    }

    wsRecognitionRef.current = null;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Interrupt while thinking (LLM generating, TTS not started yet)
  //
  // Safe to do automatically here — no TTS audio is playing yet, so
  // there is no echo risk. If the user starts talking again while
  // the assistant is still "thinking" about their last message, drop
  // that in-flight request and start listening fresh.
  // ───────────────────────────────────────────────────────────────────────────

  const interruptThinking = useCallback(() => {
    if (
      !voiceSessionActiveRef.current ||
      speechStateRef.current !== 'thinking' ||
      interruptionRef.current
    ) {
      return;
    }

    interruptionRef.current = true;

    console.info(
      '[Speech] Interrupted during thinking — restarting listening',
    );

    turnIdRef.current += 1;

    sttAbortControllerRef.current?.abort();

    sttAbortControllerRef.current = null;

    llmAbortControllerRef.current?.abort();

    llmAbortControllerRef.current = null;

    processingRef.current = false;

    stopWsRecognition();

    setState('listening');

    void startListeningRef.current();
  }, [stopWsRecognition]);

  interruptThinkingRef.current = interruptThinking;

  // ───────────────────────────────────────────────────────────────────────────

  const goToIdle = useCallback(() => {
    console.info('[Speech] State → idle');

    stopWsRecognition();

    setState('idle');

    setTranscript('');

    setResponseText('');

    setErrorMessage('');

    processingRef.current = false;

    streamBufferRef.current = '';

    ttsBufferRef.current = '';

    ttsSpeakingRef.current = false;

    setIsTtsSpeaking(false);

    ttsQueueRef.current = [];

    isResponseAtBottomRef.current = true;

    setIsResponseAtBottom(true);
  }, [stopWsRecognition]);

  const showError = useCallback((message: string) => {
    if (!voiceSessionActiveRef.current) return;

    console.info('[Speech] State → error:', message);

    stopWsRecognition();

    processingRef.current = false;

    ttsSpeakingRef.current = false;

    setIsTtsSpeaking(false);

    ttsQueueRef.current = [];

    setErrorMessage(message);

    setState('error');
  }, [stopWsRecognition]);

  // ───────────────────────────────────────────────────────────────────────────
  // Barge-in monitor
  // ───────────────────────────────────────────────────────────────────────────

  const stopBargeInMonitor = useCallback(() => {
    if (bargeInTimerRef.current !== null) {
      window.clearInterval(bargeInTimerRef.current);
      bargeInTimerRef.current = null;
    }

    bargeInMeterRef.current?.close();

    bargeInMeterRef.current = null;

    bargeInStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    bargeInStreamRef.current = null;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Stop TTS only
  // ───────────────────────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    console.info('[Speech] Stopping TTS');

    stopWsRecognition();

    turnIdRef.current += 1;

    processingRef.current = false;

    llmAbortControllerRef.current?.abort();

    llmAbortControllerRef.current = null;

    ttsAbortControllerRef.current?.abort();

    ttsAbortControllerRef.current = null;

    stopBargeInMonitor();

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

    setIsTtsSpeaking(false);

    ttsQueueRef.current = [];

    ttsBufferRef.current = '';

    streamBufferRef.current = '';
  }, [stopBargeInMonitor, stopWsRecognition]);

  // ───────────────────────────────────────────────────────────────────────────
  // Interrupt speaking
  // ───────────────────────────────────────────────────────────────────────────

  const interruptSpeaking = useCallback(() => {
    if (
      !voiceSessionActiveRef.current ||
      speechStateRef.current !== 'speaking' ||
      interruptionRef.current
    ) {
      return;
    }

    interruptionRef.current = true;

    preferWebSpeechRef.current = true;

    console.info('[Speech] Interruption detected');

    stopSpeaking();

    setState('listening');

    void startListeningRef.current();
  }, [stopSpeaking]);

  // ───────────────────────────────────────────────────────────────────────────
  // Barge-in monitor
  //
  // NOTE: Automatic volume-based barge-in was removed. Without
  // headphones, the mic reliably picked up the assistant's own TTS
  // audio and misread it as the user speaking, causing the assistant
  // to interrupt itself mid-sentence. Interruption is now manual only,
  // via the Stop button (see handleStopTts below).
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // TTS
  // ───────────────────────────────────────────────────────────────────────────

  const speakSentence = useCallback(
    (
      text: string,
      turnId: number,
      listenDuringSpeech = true,
    ) => {
      if (
        !text.trim() ||
        !voiceSessionActiveRef.current ||
        turnIdRef.current !== turnId
      ) {
        return;
      }

      if (ttsSpeakingRef.current) {
        ttsQueueRef.current.push(text);

        return;
      }

      interruptionRef.current = false;

     ttsSpeakingRef.current = true;
     setIsTtsSpeaking(true);
      console.info('[Speech] State → speaking');

      setState('speaking');

      currentSpeakingTextRef.current = text;

      // Restart recognition for this sentence so live barge-in
      // detection works during TTS playback too. This does NOT
      // reopen the raw MediaRecorder pipeline (no STT/LLM feed) —
      // it only listens for live speech, and the onresult handler
      // below compares what it hears against the text the bot is
      // currently speaking to avoid reacting to its own echoed
      // voice. See startWsRecognition's onresult handler.
      stopWsRecognition();

      startWsRecognitionRef.current();

      void listenDuringSpeech;

      const onSentenceDone = () => {
        stopBargeInMonitor();

        ttsSpeakingRef.current = false;
        setIsTtsSpeaking(false);

        ttsAudioRef.current = null;

        ttsAbortControllerRef.current = null;

        if (turnIdRef.current !== turnId) {
          return;
        }

        const nextSentence =
          ttsQueueRef.current.shift();

        if (nextSentence) {
          speakSentence(nextSentence, turnId);

          return;
        }

        // TTS queue is finished.
        processingRef.current = false;

        stopWsRecognition();

        if (
          speechStateRef.current === 'listening'
        ) {
          return;
        }

        if (mediaRecorderRef.current) {
          return;
        }

        if (!voiceSessionActiveRef.current) {
          goToIdle();

          return;
        }

        const restartTimer = window.setTimeout(() => {
          if (
            voiceSessionActiveRef.current &&
            turnIdRef.current === turnId
          ) {
            void startListeningRef.current();
          }
        }, 0);

        restartTimerRef.current = restartTimer;
      };

      const speakWithBrowserFallback = () => {
        // If this turn has been superseded (interrupted, a new
        // question started, or the session ended), do NOT speak —
        // this fallback used to fire even on an intentional abort
        // (e.g. the fetch being cancelled mid-stream), which made
        // the assistant keep speaking a stale answer after the user
        // had already moved on to a new one.
        if (
          !voiceSessionActiveRef.current ||
          turnIdRef.current !== turnId
        ) {
          return;
        }

        if (!('speechSynthesis' in window)) {
          onSentenceDone();

          return;
        }

        speechSynthesisService.speak(text, {
          onstart: () => {
            console.info(
              '[Speech] Browser TTS fallback started',
            );
          },

          onend: onSentenceDone,

          onerror: onSentenceDone,
        });
      };

      const playBlobFallback = async (
        response: Response,
      ) => {
        const audioBlob = await response.blob();

        const audioUrl =
          URL.createObjectURL(audioBlob);

        if (
          !voiceSessionActiveRef.current ||
          turnIdRef.current !== turnId
        ) {
          URL.revokeObjectURL(audioUrl);

          return;
        }

        const audio = new Audio(audioUrl);

        ttsAudioRef.current = audio;

        ttsAudioUrlRef.current = audioUrl;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);

          ttsAudioUrlRef.current = null;

          onSentenceDone();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);

          ttsAudioUrlRef.current = null;

          if (voiceSessionActiveRef.current) {
            speakWithBrowserFallback();
          }
        };

        await audio.play();
      };

      const playStreamed = async (
        response: Response,
      ): Promise<boolean> => {
        const mimeType = 'audio/mpeg';

        if (
          typeof MediaSource === 'undefined' ||
          !MediaSource.isTypeSupported(mimeType) ||
          !response.body
        ) {
          return false;
        }

        const mediaSource = new MediaSource();

        const audioUrl =
          URL.createObjectURL(mediaSource);

        const audio = new Audio(audioUrl);

        ttsAudioRef.current = audio;

        ttsAudioUrlRef.current = audioUrl;

        let settled = false;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);

          ttsAudioUrlRef.current = null;

          onSentenceDone();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);

          ttsAudioUrlRef.current = null;

          if (
            !settled &&
            voiceSessionActiveRef.current
          ) {
            speakWithBrowserFallback();
          }
        };

        await new Promise<void>((resolve) => {
          mediaSource.addEventListener(
            'sourceopen',
            async () => {
              try {
                const sourceBuffer =
                  mediaSource.addSourceBuffer(
                    mimeType,
                  );

                const reader =
                  response.body!.getReader();

                // Once the very first chunk lands,
                // start playback — the browser will
                // keep pace with buffered data as
                // more chunks arrive.
                let started = false;

                const pump =
                  async (): Promise<void> => {
                    const { done, value } =
                      await reader.read();

                    if (
                      !voiceSessionActiveRef.current ||
                      turnIdRef.current !== turnId
                    ) {
                      settled = true;

                      try {
                        await reader.cancel();
                      } catch {
                        // Ignore — session already ended.
                      }

                      return;
                    }

                    if (done) {
                      if (
                        mediaSource.readyState ===
                        'open'
                      ) {
                        mediaSource.endOfStream();
                      }

                      return;
                    }

                    await new Promise<void>(
                      (
                        resolveAppend,
                        rejectAppend,
                      ) => {
                        sourceBuffer.addEventListener(
                          'updateend',
                          () => resolveAppend(),
                          { once: true },
                        );

                        sourceBuffer.addEventListener(
                          'error',
                          () =>
                            rejectAppend(
                              new Error(
                                'sourceBuffer append failed',
                              ),
                            ),
                          { once: true },
                        );

                        sourceBuffer.appendBuffer(
                          value,
                        );
                      },
                    );

                    if (!started) {
                      started = true;

                      void audio.play();
                    }

                    await pump();
                  };

                await pump();
              } catch (error) {
                settled = true;

                console.warn(
                  '[Speech] Streamed TTS playback failed, falling back:',
                  error,
                );

                if (voiceSessionActiveRef.current) {
                  speakWithBrowserFallback();
                }
              } finally {
                resolve();
              }
            },
            { once: true },
          );
        });

        return true;
      };

      const speakWithElevenLabs = async () => {
        const controller = new AbortController();

        ttsAbortControllerRef.current = controller;

        try {
          const response = await synthesizeSpeech(
            text,
            controller.signal,
          );

          if (
            !voiceSessionActiveRef.current ||
            turnIdRef.current !== turnId
          ) {
            return;
          }

          const streamed =
            await playStreamed(response.clone());

          if (!streamed) {
            await playBlobFallback(response);
          }

          // NOTE: Automatic barge-in monitoring is intentionally
          // disabled here. Without headphones, the mic picks up the
          // TTS audio itself, and even volume-only detection was
          // mistaking that for the user speaking — causing the
          // assistant to interrupt its own playback. Users can still
          // interrupt manually via the Stop button (handleStopTts).
        } catch (error) {
          if (
            controller.signal.aborted ||
            !voiceSessionActiveRef.current ||
            turnIdRef.current !== turnId
          ) {
            return;
          }

          console.warn(
            '[Speech] ElevenLabs TTS failed:',
            error,
          );

          speakWithBrowserFallback();
        }
      };

      void speakWithElevenLabs();
    },
    [
      goToIdle,
      stopBargeInMonitor,
      stopWsRecognition,
    ],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // LLM stream chunk
  // ───────────────────────────────────────────────────────────────────────────

  const handleStreamChunk = useCallback(
    (chunk: string, turnId: number) => {
      if (
        !voiceSessionActiveRef.current ||
        turnIdRef.current !== turnId
      ) {
        return;
      }

      streamBufferRef.current += chunk;

      setResponseText(streamBufferRef.current);

      ttsBufferRef.current += chunk;

      let match =
        ttsBufferRef.current.match(
          /^(.*?[.!?\u3002\uff01\uff1f])\s/,
        );

      // If no full sentence yet but the buffer is
      // already long, break at a comma instead —
      // gets audio starting sooner on long sentences
      // without fragmenting short, quick replies.
      if (
        !match &&
        ttsBufferRef.current.length >= 60
      ) {
        match =
          ttsBufferRef.current.match(
            /^(.*?[,\uff0c])\s/,
          );
      }

      if (match) {
        const sentence = match[1].trim();

        ttsBufferRef.current =
          ttsBufferRef.current.slice(
            match[0].length,
          );

        speakSentence(sentence, turnId);
      }
    },
    [speakSentence],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Web Speech recognition
  //
  // IMPORTANT:
  // This is responsible for LIVE transcription.
  // It must NOT wait for MediaRecorder to stop.
  // ───────────────────────────────────────────────────────────────────────────

  const startWsRecognition = useCallback(() => {
    const windowSpeech = window as WSW;

    const Ctor =
      windowSpeech.SpeechRecognition ||
      windowSpeech.webkitSpeechRecognition;

    if (!Ctor) {
      console.warn(
        '[Speech] Web Speech API is not supported in this browser.',
      );

      return;
    }

    if (wsActiveRef.current) {
      return;
    }

    if (wsRestartTimerRef.current !== null) {
      window.clearTimeout(wsRestartTimerRef.current);

      wsRestartTimerRef.current = null;
    }

    wsFinalTextRef.current = '';

    wsInterimTextRef.current = '';

    wsActiveRef.current = true;

    wsStartingRef.current = true;

    const recognition = new Ctor();

    recognition.continuous = true;

    recognition.interimResults = true;

    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      if (!wsActiveRef.current) {
        return;
      }

      let finalText = '';

      let interimText = '';

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        const result = event.results[i];

        const text =
          result[0]?.transcript ?? '';

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        wsFinalTextRef.current += finalText;
      }

      wsInterimTextRef.current = interimText;

      const display = [
        wsFinalTextRef.current,
        wsInterimTextRef.current,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!display) {
        return;
      }

      const normalized =
        normalizeNetkathir(display);

      const meaningfulSpeech =
        normalized.replace(
          /[^\p{L}\p{N}]/gu,
          '',
        ).length >=
        MEANINGFUL_SPEECH_MIN_CHARS;

      if (speechStateRef.current === 'speaking') {
        // Compare what the mic heard against what the bot is
        // currently saying. Without headphones, the mic can pick
        // up the TTS audio itself — if the recognized text is
        // basically contained in the bot's own current sentence,
        // treat it as an echo and ignore it rather than
        // interrupting the bot's own voice.
        const heard = normalized
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, '')
          .trim();

        const spoken =
          currentSpeakingTextRef.current
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .trim();

        const isLikelyEcho =
          heard.length > 0 &&
          spoken.includes(heard);

        if (meaningfulSpeech && !isLikelyEcho) {
          interruptSpeaking();
        }

        // Don't show possibly-echoed text as the live transcript.
        return;
      }

      // THIS is the live UI update.
      // Interim browser recognition is shown immediately.
      setTranscript(normalized);

      if (
        meaningfulSpeech &&
        speechStateRef.current === 'thinking'
      ) {
        interruptThinkingRef.current();
      }
    };

    recognition.onerror = (event) => {
      console.warn(
        '[Speech] Web Speech error:',
        event.error,
      );

      wsStartingRef.current = false;

      // Some browser errors are temporary.
      // Keep the live recognition active.
      if (
        wsActiveRef.current &&
        event.error !== 'not-allowed' &&
        event.error !== 'service-not-allowed'
      ) {
        if (wsRestartTimerRef.current === null) {
          wsRestartTimerRef.current =
            window.setTimeout(() => {
              wsRestartTimerRef.current = null;

              if (wsActiveRef.current) {
                startWsRecognition();
              }
            }, 300);
        }
      }
    };

    recognition.onend = () => {
      wsStartingRef.current = false;

      if (!wsActiveRef.current) {
        return;
      }

      // Chrome can automatically end SpeechRecognition.
      // Restart it so live transcription continues.
      if (wsRestartTimerRef.current === null) {
        wsRestartTimerRef.current =
          window.setTimeout(() => {
            wsRestartTimerRef.current = null;

            if (wsActiveRef.current) {
              wsActiveRef.current = false;

              startWsRecognition();
            }
          }, 100);
      }
    };

    wsRecognitionRef.current = recognition;

    try {
      recognition.start();

      console.info(
        '[Speech] Live transcription started',
      );
    } catch (error) {
      wsStartingRef.current = false;

      console.warn(
        '[Speech] Could not start Web Speech recognition:',
        error,
      );

      wsRecognitionRef.current = null;
    }
  }, [interruptSpeaking]);

  startWsRecognitionRef.current = startWsRecognition;

  // ───────────────────────────────────────────────────────────────────────────
  // (stopWsRecognition moved above, near goToIdle)
  // ───────────────────────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // Stop recording
  //
  // This stops MediaRecorder but also finalizes the current Web Speech text.
  // ───────────────────────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(
        silenceTimerRef.current,
      );

      silenceTimerRef.current = null;
    }

    silenceMeterRef.current?.close();

    silenceMeterRef.current = null;

    if (
      mediaRecorderRef.current?.state ===
      'recording'
    ) {
      mediaRecorderRef.current.stop();
    }

    stopWsRecognition();

    setIsListening(false);
  }, [stopWsRecognition]);

  stopListeningRef.current = stopListening;

  // ───────────────────────────────────────────────────────────────────────────
  // Full voice-session cleanup
  // ───────────────────────────────────────────────────────────────────────────

  const stopVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;

    turnIdRef.current += 1;

    processingRef.current = false;

    if (welcomeTimerRef.current !== null) {
      window.clearTimeout(
        welcomeTimerRef.current,
      );

      welcomeTimerRef.current = null;
    }

    if (restartTimerRef.current !== null) {
      window.clearTimeout(
        restartTimerRef.current,
      );

      restartTimerRef.current = null;
    }

    stopListening();

    stopWsRecognition();

    stopBargeInMonitor();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;

      mediaRecorderRef.current.onstop = null;

      mediaRecorderRef.current = null;
    }

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    mediaStreamRef.current = null;

    llmAbortControllerRef.current?.abort();

    llmAbortControllerRef.current = null;

    sttAbortControllerRef.current?.abort();

    sttAbortControllerRef.current = null;

    ttsAbortControllerRef.current?.abort();

    ttsAbortControllerRef.current = null;

    speechSynthesisService.cancel();

    ttsAudioRef.current?.pause();

    if (ttsAudioRef.current) {
      ttsAudioRef.current.src = '';

      ttsAudioRef.current.onended = null;

      ttsAudioRef.current.onerror = null;
    }

    ttsAudioRef.current = null;

    if (ttsAudioUrlRef.current) {
      URL.revokeObjectURL(
        ttsAudioUrlRef.current,
      );

      ttsAudioUrlRef.current = null;
    }

    ttsSpeakingRef.current = false;

    setIsTtsSpeaking(false);

    ttsQueueRef.current = [];

    ttsBufferRef.current = '';

    streamBufferRef.current = '';

    wsFinalTextRef.current = '';

    wsInterimTextRef.current = '';

    setIsListening(false);

    setState('idle');
  }, [
    stopBargeInMonitor,
    stopListening,
    stopWsRecognition,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Process recorded audio
  // ───────────────────────────────────────────────────────────────────────────

  const processRecording = useCallback(
    async (audioBlob: Blob) => {
      if (!voiceSessionActiveRef.current) {
        return;
      }

      setIsListening(false);

      stopWsRecognition();

      console.info(
        '[Speech] Stop listening',
      );

      // Web Speech text was already shown live.
      // Preserve it as the fallback/final browser transcript.
      const wsText = normalizeNetkathir(
        wsFinalTextRef.current.trim(),
      );

      const useWebSpeech =
        preferWebSpeechRef.current;

      preferWebSpeechRef.current = false;

      if (wsText) {
        setTranscript(wsText);
      }

      setState('thinking');

      processingRef.current = true;

      turnIdRef.current += 1;

      const currentTurn =
        turnIdRef.current;

      interruptionRef.current = false;

      // Allow interrupting while the assistant is "thinking"
      // (STT + LLM in flight, no TTS audio playing yet) — safe
      // to listen here since there's nothing being played back
      // that could echo into the mic.
      startWsRecognition();

      // ────────────────────────────────────────
      // Final STT
      // ────────────────────────────────────────

      let finalText = '';

      const sttController =
        new AbortController();

      sttAbortControllerRef.current =
        sttController;

      try {
        console.info(
          '[Speech] Trying Sarvam STT...',
        );

        finalText =
          useWebSpeech && wsText
            ? wsText
            : normalizeNetkathir(
                await transcribeAudio(
                  audioBlob,
                  sttController.signal,
                ),
              );

        console.info(
          '[Speech] Final transcript:',
          finalText,
        );
      } catch (error) {
        if (
          sttController.signal.aborted ||
          !voiceSessionActiveRef.current
        ) {
          return;
        }

        console.warn(
          '[Speech] Sarvam STT failed:',
          error,
        );

        finalText = wsText;

        if (finalText) {
          console.info(
            '[Speech] Using Web Speech fallback:',
            finalText,
          );
        }
      }

      sttAbortControllerRef.current = null;

      if (
        !voiceSessionActiveRef.current ||
        turnIdRef.current !== currentTurn
      ) {
        return;
      }

      if (!finalText.trim()) {
        console.info(
          '[Speech] No transcript — returning to listening',
        );

        processingRef.current = false;

        stopWsRecognition();

        void startListeningRef.current();

        return;
      }

      finalText =
        normalizeNetkathir(
          finalText.trim(),
        );

      setTranscript(finalText);

      // ────────────────────────────────────────
      // Add user message
      // ────────────────────────────────────────

      const threadId =
        activeThreadIdRef.current ||
        createThreadRef.current().id;

      addMessageRef.current(
        threadId,
        {
          role: 'user',
          content: finalText,
        },
      );

      // ────────────────────────────────────────
      // LLM stream
      // ────────────────────────────────────────

      console.info(
        '[Speech] LLM started',
      );

      streamBufferRef.current = '';

      ttsBufferRef.current = '';

      isResponseAtBottomRef.current =
        true;

      setIsResponseAtBottom(true);

      setResponseText('');

      try {
        const llmController =
          new AbortController();

        llmAbortControllerRef.current =
          llmController;

        const sessionId =
          useChatStore
            .getState()
            .threads.find(
              (thread) =>
                thread.id === threadId,
            )?.sessionId;

        const newSessionId =
          await sendChatMessageStream(
            finalText,
            (chunk) => {
              handleStreamChunk(
                chunk,
                currentTurn,
              );
            },
            sessionId,
            llmController.signal,
          );

        llmAbortControllerRef.current =
          null;

        if (
          !voiceSessionActiveRef.current ||
          turnIdRef.current !== currentTurn
        ) {
          return;
        }

        if (
          newSessionId &&
          !sessionId
        ) {
          setSessionRef.current(
            threadId,
            newSessionId,
          );
        }

        console.info(
          '[Speech] LLM completed',
        );

        processingRef.current = false;

        // ────────────────────────────────────
        // Flush remaining TTS buffer
        // ────────────────────────────────────

        const remaining =
          ttsBufferRef.current.trim();

        ttsBufferRef.current = '';

        if (remaining) {
          speakSentence(
            remaining,
            currentTurn,
          );
        } else if (
          !ttsSpeakingRef.current &&
          ttsQueueRef.current.length === 0
        ) {
          stopWsRecognition();

          void startListeningRef.current();
        }

        // ────────────────────────────────────
        // Save bot message
        // ────────────────────────────────────

        const fullResponse =
          streamBufferRef.current.trim();

        if (fullResponse) {
          addMessageRef.current(
            threadId,
            {
              role: 'bot',
              content: fullResponse,
            },
          );
        }
      } catch (error) {
        llmAbortControllerRef.current =
          null;

        if (
          !voiceSessionActiveRef.current ||
          turnIdRef.current !== currentTurn
        ) {
          return;
        }

        const message =
          error instanceof ApiError
            ? error.message
            : 'Could not complete that request. Please try again.';

        console.warn(
          '[Speech] LLM failed:',
          error,
        );

        showError(message);
      }
    },
    [
      handleStreamChunk,
      showError,
      speakSentence,
      startWsRecognition,
      stopWsRecognition,
    ],
  );

  processRecordingRef.current =
    processRecording;

  // ───────────────────────────────────────────────────────────────────────────
  // Start listening
  // ───────────────────────────────────────────────────────────────────────────

  const startListening = useCallback(
    async (
      allowDuringSpeech = false,
    ) => {
      if (
        !voiceSessionActiveRef.current
      ) {
        return;
      }

      if (
        processingRef.current &&
        !allowDuringSpeech
      ) {
        return;
      }

      // If already recording, don't create another recorder.
      if (
        mediaRecorderRef.current?.state ===
        'recording'
      ) {
        // Make sure live recognition is running.
        if (!wsActiveRef.current) {
          startWsRecognition();
        }

        setState('listening');

        return;
      }

      try {
        let stream =
          mediaStreamRef.current;

        if (
          !stream ||
          stream
            .getTracks()
            .every(
              (track) =>
                track.readyState === 'ended',
            )
        ) {
          stream =
            await navigator.mediaDevices.getUserMedia(
              MIC_CONSTRAINTS,
            );

          mediaStreamRef.current =
            stream;
        }

        if (
          !voiceSessionActiveRef.current
        ) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop(),
            );

          return;
        }

        const recorder =
          new MediaRecorder(stream);

        audioChunksRef.current = [];

        recorder.ondataavailable = (
          event,
        ) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(
              event.data,
            );
          }
        };

        recorder.onstop = () => {
          stopListening();

          const audioBlob =
            new Blob(
              audioChunksRef.current,
              {
                type: 'audio/webm',
              },
            );

          mediaRecorderRef.current =
            null;

          if (
            !voiceSessionActiveRef.current
          ) {
            return;
          }

          if (
            audioBlob.size === 0
          ) {
            console.warn(
              '[Speech] Empty audio recording',
            );

            void startListeningRef.current();

            return;
          }

          if (!speechDetectedRef.current) {
            console.info(
              '[Speech] No speech volume detected — skipping STT',
            );

            void startListeningRef.current();

            return;
          }

          void processRecordingRef.current(
            audioBlob,
          );
        };

        mediaRecorderRef.current =
          recorder;

        recorder.start();

        // ────────────────────────────────────
        // Silence detection
        // ────────────────────────────────────

        const meter =
          createVolumeMeter(stream);

        silenceMeterRef.current =
          meter;

        const startedAt =
          performance.now();

        speechDetectedRef.current = false;

        let silenceStartedAt:
          number | null = null;

        if (
          silenceTimerRef.current !==
          null
        ) {
          window.clearInterval(
            silenceTimerRef.current,
          );
        }

        silenceTimerRef.current =
          window.setInterval(() => {
            if (
              !voiceSessionActiveRef.current
            ) {
              stopListening();

              return;
            }

            if (
              speechStateRef.current ===
              'speaking'
            ) {
              return;
            }

            const volume =
              meter.getVolume();

            const now =
              performance.now();

            if (
              volume >
              SPEECH_VOLUME_THRESHOLD
            ) {
              speechDetectedRef.current = true;

              silenceStartedAt =
                null;
            } else if (
              speechDetectedRef.current &&
              volume <
                SILENCE_VOLUME_THRESHOLD
            ) {
              silenceStartedAt ??= now;

              if (
                now -
                  silenceStartedAt >=
                SILENCE_DURATION_MS
              ) {
                stopListening();
              }
            } else if (
              !speechDetectedRef.current &&
              now - startedAt >=
              MAX_LISTEN_MS
            ) {
              stopListening();
            }
          }, VOLUME_POLL_INTERVAL_MS);

        setIsListening(true);

        setErrorMessage('');

        setState('listening');

        // ────────────────────────────────────
        // START LIVE TRANSCRIPTION
        // ────────────────────────────────────

        startWsRecognition();

        console.info(
          '[Speech] Start listening + live transcription',
        );
      } catch (error) {
        console.warn(
          '[Speech] Mic access denied:',
          error,
        );

        showError(
          'Microphone access was denied or unavailable.',
        );
      }
    },
    [
      showError,
      startWsRecognition,
      stopListening,
    ],
  );

  startListeningRef.current =
    startListening;

  // ───────────────────────────────────────────────────────────────────────────
  // Main button
  // ───────────────────────────────────────────────────────────────────────────

  const handleToggle = useCallback(() => {
    if (state === 'listening') {
      // User explicitly pauses recording.
      if (
        mediaRecorderRef.current
          ?.state === 'recording'
      ) {
        mediaRecorderRef.current.stop();
      }

      return;
    }

    if (
      (state === 'idle' ||
        state === 'error') &&
      !disabled
    ) {
      void startListening();
    }
  }, [
    disabled,
    startListening,
    state,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Stop TTS button
  //
  // IMPORTANT:
  // Stop does NOT go to idle.
  // Stop does NOT clear transcript.
  // Stop does NOT stop microphone.
  //
  // It only stops TTS and moves to listening.
  // ───────────────────────────────────────────────────────────────────────────

  const handleStopTts = useCallback(() => {
    if (
      speechStateRef.current !==
      'speaking'
    ) {
      return;
    }

    console.info(
      '[Speech] Stop button → stop TTS → listening',
    );

    stopSpeaking();

    interruptionRef.current = false;

    preferWebSpeechRef.current = false;

    processingRef.current = false;

    setState('listening');

    // If a recorder is already active because
    // listening-during-speech is enabled,
    // keep it.
    if (
      mediaRecorderRef.current?.state ===
      'recording'
    ) {
      setIsListening(true);

      if (!wsActiveRef.current) {
        startWsRecognition();
      }

      return;
    }

    // Otherwise start a fresh listening turn.
    void startListeningRef.current();
  }, [
    startWsRecognition,
    stopSpeaking,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  // ───────────────────────────────────────────────────────────────────────────
  // Open / close + welcome
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      welcomeSpokenRef.current = false;

      stopVoiceSession();

      return;
    }

    voiceSessionActiveRef.current =
      true;

    turnIdRef.current += 1;

    goToIdle();

    if (
      welcomeSpokenRef.current
    ) {
      return;
    }

    welcomeSpokenRef.current =
      true;

    welcomeTimerRef.current =
      window.setTimeout(() => {
        welcomeTimerRef.current =
          null;

        if (
          !voiceSessionActiveRef.current
        ) {
          return;
        }

        const turn =
          turnIdRef.current;

        speakSentence(
          WELCOME_TEXT,
          turn,
          false,
        );
      }, WELCOME_DELAY_MS);

    return () => {
      if (
        welcomeTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          welcomeTimerRef.current,
        );

        welcomeTimerRef.current =
          null;
      }
    };
  }, [
    goToIdle,
    isOpen,
    speakSentence,
    stopVoiceSession,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Response scrolling
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const element =
      responseContainerRef.current;

    if (!element) {
      return;
    }

    const handleScroll = () => {
      const atBottom =
        element.scrollHeight -
          element.scrollTop -
          element.clientHeight <
        40;

      isResponseAtBottomRef.current =
        atBottom;

      setIsResponseAtBottom(atBottom);
    };

    element.addEventListener(
      'scroll',
      handleScroll,
      {
        passive: true,
      },
    );

    handleScroll();

    return () => {
      element.removeEventListener(
        'scroll',
        handleScroll,
      );
    };
  }, [state]);

  useEffect(() => {
    const element =
      responseContainerRef.current;

    if (
      !element ||
      !isResponseAtBottomRef.current
    ) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior: 'auto',
    });
  }, [responseText]);

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  if (!isOpen) {
    return null;
  }

  const isActive =
    state !== 'idle';

  const statusText =
    state === 'listening'
      ? 'Listening'
      : state === 'thinking'
        ? 'Thinking...'
        : state === 'speaking'
          ? 'Speaking...'
          : state === 'error'
            ? 'Something went wrong'
            : 'Speech to speech';

  const orbClass =
    state === 'listening'
      ? 'voice-orb-listening'
      : state === 'thinking'
        ? 'voice-orb-thinking'
        : state === 'speaking'
          ? 'voice-orb-speaking'
          : 'voice-orb-idle';

  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] flex flex-col',
        isDarkMode
          ? 'bg-[#050806] text-white'
          : 'bg-[#f8fcf5] text-midnight-900',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500">
          Netkathir voice
        </span>

        <button
          type="button"
          onClick={() => {
            stopVoiceSession();
            onClose();
          }}
          aria-label="Close speech to speech"
          className={cn(
            'rounded-full p-2 transition-colors',
            isDarkMode
              ? 'text-white/50 hover:bg-white/10 hover:text-white'
              : 'text-midnight-400 hover:bg-green-100 hover:text-green-700',
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        {/* Orb */}
        <div
          className={cn(
            'voice-orb relative mb-8 h-[76px] w-[76px] rounded-full sm:h-[88px] sm:w-[88px]',
            orbClass,
          )}
          role="img"
          aria-label={`${statusText} orb`}
        />

        {/* Waveform */}
        <div
          className={cn(
            'voice-waveform mb-5',
            `voice-waveform-${state}`,
          )}
          aria-hidden="true"
        >
          {Array.from(
            { length: 9 },
            (_, index) => (
              <span key={index} />
            ),
          )}
        </div>

        <h1 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-4xl">
          Welcome to Netkathir.
        </h1>

        <p
          className={cn(
            'mt-2 max-w-xl text-base sm:text-lg',
            isDarkMode
              ? 'text-white/60'
              : 'text-midnight-500',
          )}
        >
          {state === 'idle' ||
          state === 'error'
            ? 'How can I help you?'
            : statusText}
        </p>

        {/* Conversation */}
        {(isActive ||
          transcript ||
          responseText ||
          errorMessage) && (
          <div className="mt-7 w-full max-w-xl space-y-3">
            {/* User transcript */}
            {transcript && (
              <div
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left text-sm',
                  isDarkMode
                    ? 'border-white/10 bg-white/[0.04] text-white/75'
                    : 'border-green-200 bg-white/80 text-midnight-700',
                )}
              >
                <div className="mb-1 flex items-center gap-2 font-medium">
                  {state ===
                    'listening' && (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  )}

                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wide',
                      isDarkMode
                        ? 'text-green-400/70'
                        : 'text-green-600',
                    )}
                  >
                    You
                  </span>
                </div>

                <p className="leading-relaxed">
                  {transcript}
                </p>
              </div>
            )}

            {/* Bot response */}
            {(responseText ||
              state === 'thinking' ||
              state === 'speaking') && (
              <div
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left text-sm',
                  isDarkMode
                    ? 'border-white/10 bg-white/[0.04] text-white/75'
                    : 'border-green-200 bg-white/80 text-midnight-700',
                )}
              >
                <div className="mb-1 flex items-center gap-2 font-medium">
                  {state ===
                    'thinking' && (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  )}

                  {state ===
                    'speaking' && (
                    <Volume2 className="h-4 w-4 text-green-500" />
                  )}

                  {state ===
                    'error' && (
                    <span className="text-red-500">
                      Error
                    </span>
                  )}

                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wide',
                      isDarkMode
                        ? 'text-green-400/70'
                        : 'text-green-600',
                    )}
                  >
                    Netkathir
                  </span>
                </div>

                <div
                  ref={
                    responseContainerRef
                  }
                  className="min-h-0 max-h-[42dvh] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] sm:max-h-[22rem]"
                >
                  <p className="leading-relaxed whitespace-pre-wrap">
                    {errorMessage ||
                      responseText ||
                      (state ===
                      'thinking'
                        ? 'Processing...'
                        : '')}
                  </p>
                </div>

                {!isResponseAtBottom && (
                  <button
                    type="button"
                    onClick={() => {
                      const element =
                        responseContainerRef.current;

                      if (!element) {
                        return;
                      }

                      isResponseAtBottomRef.current =
                        true;

                      setIsResponseAtBottom(
                        true,
                      );

                      element.scrollTo({
                        top: element.scrollHeight,
                        behavior: 'smooth',
                      });
                    }}
                    className={cn(
                      'mt-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      isDarkMode
                        ? 'bg-white/10 text-white/75 hover:bg-white/15'
                        : 'bg-green-100 text-green-700 hover:bg-green-200',
                    )}
                    aria-label="Scroll to newest response text"
                  >
                    <ArrowDown className="h-3 w-3" />

                    New text
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stop TTS button */}
        {isTtsSpeaking && (
          <button
            type="button"
            onClick={handleStopTts}
            className="mt-5 flex items-center justify-center gap-2 rounded-full bg-red-500 px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-600 active:scale-95"
          >
            <MicOff className="h-4 w-4" />
            Stop
          </button>
        )}

        {/* Main listening button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={
            disabled ||
            state === 'thinking' ||
            state === 'speaking'
          }
          className={cn(
            'mt-8 flex min-w-52 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-all active:scale-95',

            state === 'listening'
              ? 'bg-red-500 text-white hover:bg-red-600'
              : isDarkMode
                ? 'bg-green-400 text-black hover:bg-green-300'
                : 'bg-green-600 text-white hover:bg-green-700',

            (disabled ||
              state === 'thinking' ||
              state === 'speaking') &&
              'cursor-not-allowed opacity-50',
          )}
        >
          {state ===
          'listening' ? (
            <MicOff className="h-4 w-4" />
          ) : state ===
            'thinking' ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : state ===
            'speaking' ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}

          {state === 'listening'
            ? 'Pause listening'
            : state === 'thinking'
              ? 'Thinking...'
              : state === 'speaking'
                ? 'Speaking...'
                : state === 'error'
                  ? 'Try again'
                  : 'Start Conversation'}
        </button>
      </div>
    </div>
  );
}