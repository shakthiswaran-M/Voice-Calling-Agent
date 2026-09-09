export interface SpeechSynthesisOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (event: SpeechSynthesisErrorEvent) => void;
}

type VoiceListener = (voices: SpeechSynthesisVoice[]) => void;

const FEMALE_VOICE_HINTS = [
  'female', 'woman', 'girl', 'samantha', 'victoria', 'zira', 'hazel',
  'susan', 'karen', 'moira', 'ava', 'aria', 'jenny', 'sara', 'sarah',
];

const NATURAL_VOICE_HINTS = [
  'natural', 'neural', 'premium', 'enhanced', 'expressive', 'wavenet',
  'online', 'human', 'multilingual', 'microsoft', 'google', 'siri',
];

class SpeechSynthesisService {
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<VoiceListener>();
  private listeningForVoiceChanges = false;
  private pendingSpeechCleanup: (() => void) | null = null;

  private get synthesis(): SpeechSynthesis | null {
    return 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  private refreshVoices = (): void => {
    const synthesis = this.synthesis;
    if (!synthesis) return;
    this.voices = synthesis.getVoices();
    this.listeners.forEach((listener) => listener(this.voices));
  };

  private ensureVoiceListener(): void {
    const synthesis = this.synthesis;
    if (!synthesis || this.listeningForVoiceChanges) return;
    this.listeningForVoiceChanges = true;
    synthesis.addEventListener('voiceschanged', this.refreshVoices);
    this.refreshVoices();
  }

  getVoices(): SpeechSynthesisVoice[] {
    this.ensureVoiceListener();
    return this.voices;
  }

  subscribe(listener: VoiceListener): () => void {
    this.ensureVoiceListener();
    this.listeners.add(listener);
    listener(this.voices);
    return () => this.listeners.delete(listener);
  }

  selectBestSpeechVoice(language = navigator.language || 'en-US'): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (voices.length === 0) return null;

    const normalizedLanguage = language.toLowerCase();
    const languageBase = normalizedLanguage.split('-')[0];
    const scoreVoice = (voice: SpeechSynthesisVoice): number => {
      const name = voice.name.toLowerCase();
      const voiceLanguage = voice.lang.toLowerCase();
      const exactLanguage = voiceLanguage === normalizedLanguage;
      const compatibleLanguage = voiceLanguage === languageBase || voiceLanguage.startsWith(`${languageBase}-`);
      const femaleHint = FEMALE_VOICE_HINTS.some((hint) => name.includes(hint));
      const naturalHint = NATURAL_VOICE_HINTS.some((hint) => name.includes(hint));

      let score = 0;
      if (exactLanguage) score += 100;
      else if (compatibleLanguage) score += 65;
      else score -= 25;
      if (femaleHint) score += 45;
      if (naturalHint) score += 30;
      if (voice.localService) score += 8;
      if (voice.default) score += 3;
      return score;
    };

    return voices.reduce((best, voice) => (
      scoreVoice(voice) > scoreVoice(best) ? voice : best
    ));
  }

  speak(text: string, options: SpeechSynthesisOptions = {}): SpeechSynthesisUtterance | null {
    const synthesis = this.synthesis;
    if (!synthesis) return null;

    const language = options.language || navigator.language || 'en-US';
    const createUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.selectBestSpeechVoice(language);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = language;
      }
      utterance.rate = options.rate ?? 0.96;
      utterance.pitch = options.pitch ?? 1.02;
      utterance.volume = options.volume ?? 1;
      utterance.onstart = options.onstart ?? null;
      utterance.onend = options.onend ?? null;
      utterance.onerror = options.onerror ?? null;
      return utterance;
    };

    const speakNow = () => {
      const utterance = createUtterance();
      synthesis.speak(utterance);
      return utterance;
    };

    this.cancel();
    if (this.getVoices().length === 0) {
      let completed = false;
      let timeoutId: number | undefined;
      const cleanup = () => {
        if (completed) return;
        completed = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        unsubscribe();
        if (this.pendingSpeechCleanup === cleanup) this.pendingSpeechCleanup = null;
      };
      const unsubscribe = this.subscribe((voices) => {
        if (voices.length === 0 || completed) return;
        cleanup();
        speakNow();
      });
      timeoutId = window.setTimeout(() => {
        if (completed) return;
        cleanup();
        speakNow();
      }, 500);
      this.pendingSpeechCleanup = cleanup;
      return new SpeechSynthesisUtterance(text);
    }

    return speakNow();
  }

  cancel(): void {
    this.pendingSpeechCleanup?.();
    this.synthesis?.cancel();
  }

  pause(): void {
    this.synthesis?.pause();
  }

  resume(): void {
    this.synthesis?.resume();
  }
}

export const speechSynthesisService = new SpeechSynthesisService();
