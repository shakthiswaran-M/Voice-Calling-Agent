export function cancelBrowserTts(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function speakWithBrowserTts(text: string, onEnd: () => void): boolean {
  if (!("speechSynthesis" in window)) {
    console.warn('[TTS] Web Speech API is not supported in this browser');
    return false;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => console.info('[TTS] Browser speech started');
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
      console.warn('[TTS] Browser speech failed:', event.error);
      onEnd();
    };
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.warn('[TTS] Could not start browser speech:', error);
    return false;
  }
}