// src/components/chat/ChatInput.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isCentered?: boolean;
  isDarkMode?: boolean;
  startListening?: boolean;
}

export function ChatInput({ onSend, disabled = false, isCentered = false, isDarkMode = true, startListening = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const startVoiceInput = useCallback(() => {
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    if (isListening) { stopListening(); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      if (finalTranscript) { setMessage((prev) => prev + finalTranscript); setInterimText(''); }
      else setInterimText(interimTranscript);
    };
    recognition.onerror = () => { setIsListening(false); setInterimText(''); };
    recognition.onend = () => { setIsListening(false); setInterimText(''); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, stopListening, SpeechRecognition]);

  useEffect(() => {
    if (startListening && !isListening && SpeechRecognition) startVoiceInput();
  }, [startListening]);

  useEffect(() => () => { if (recognitionRef.current) recognitionRef.current.stop(); }, []);

  const handleSend = () => {
    const textToSend = message.trim();
    if (textToSend && !disabled) {
      if (isListening) stopListening();
      onSend(textToSend);
      setMessage('');
      setInterimText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const displayText = message + interimText;
  const hasContent = message.trim().length > 0;

  const inputBg = isDarkMode ? 'bg-white/3' : 'bg-white';
  const inputBorder = isDarkMode ? 'border-white/8' : 'border-midnight-200/60';
  const inputBorderFocus = isDarkMode ? 'shadow-cyan-glow bg-white/5' : 'shadow-cyan-glow bg-white';
  const textColor = isDarkMode ? 'text-white' : 'text-midnight-900';
  const placeholderColor = isDarkMode ? 'placeholder:text-white/30' : 'placeholder:text-midnight-300';
  const interimColor = isDarkMode ? 'text-white/70' : 'text-midnight-400';

  if (isCentered) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 slide-up-enter" style={{ animationDelay: '0.3s' }}>
        <div className={cn('relative rounded-2xl border border-white/10 transition-all duration-400', isFocused || isListening ? inputBorderFocus : `${inputBg}`)}>
          {isListening && (
            <div className={cn('absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full', isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-cyan-50 border border-cyan-200')}>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] text-cyan-500 font-medium">Listening...</span>
              <button onClick={stopListening} className="text-cyan-400/60 hover:text-cyan-500 ml-1"><MicOff className="w-3 h-3" /></button>
            </div>
          )}
          <textarea ref={textareaRef} value={displayText} onChange={handleChange} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} placeholder={isListening ? 'Listening...' : 'Ask me anything...'} disabled={disabled} rows={1} className={cn('w-full resize-none bg-transparent text-base focus:outline-none border-none px-6 py-5 pr-24 max-h-[140px] leading-relaxed font-light', textColor, placeholderColor, interimText && interimColor)} />
          <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
            <button onClick={startVoiceInput} className={cn('p-2.5 rounded-xl transition-all duration-300', isListening ? 'bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse' : isDarkMode ? 'text-white/40 hover:text-cyan-400 hover:bg-white/5' : 'text-midnight-300 hover:text-cyan-600 hover:bg-ivory-100')}>
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button onClick={handleSend} disabled={!hasContent || disabled} className={cn('p-2 rounded-xl shrink-0 transition-all duration-300', hasContent && !disabled ? 'bg-cyan-500 text-[#050816] shadow-cyan-glow hover:shadow-lg active:scale-95' : isDarkMode ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-midnight-100 text-midnight-300 cursor-not-allowed')}>
              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <p className={cn('text-[10px] mt-3 text-center', isDarkMode ? 'text-white/20' : 'text-midnight-300')}>
          Press <kbd className={cn('px-1 py-0.5 rounded text-[9px] font-mono', isDarkMode ? 'bg-white/5' : 'bg-midnight-100')}>Enter</kbd> to send
        </p>
      </div>
    );
  }

  return (
    <div className={cn('border-t backdrop-blur-md', isDarkMode ? 'border-white/5 bg-[#050816]/80' : 'border-midnight-100/50 bg-white/80')}>
      <div className="max-w-3xl mx-auto px-6 py-4">
        <div className={cn('flex items-center gap-1 rounded-2xl border transition-all duration-300 pr-1', isFocused || isListening ? inputBorderFocus : `${inputBg} ${inputBorder}`)}>
          {/* <button className={cn('p-3 transition-colors', isDarkMode ? 'text-white/30 hover:text-cyan-400' : 'text-midnight-300 hover:text-cyan-600')} disabled aria-label="Attach file">
            <Paperclip className="w-4.5 h-4.5" />
          </button> */}
          <textarea ref={textareaRef} value={displayText} onChange={handleChange} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} placeholder={isListening ? 'Listening...' : 'Type your message...'} disabled={disabled} rows={1} className={cn('flex-1 resize-none bg-transparent text-sm focus:outline-none border-none py-3 pl-4 max-h-[140px] leading-relaxed', textColor, placeholderColor, interimText && interimColor)} />
           {/* <button onClick={startVoiceInput} className={cn('p-2.5 rounded-xl transition-all duration-300', isListening ? 'bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse' : isDarkMode ? 'text-white/30 hover:text-cyan-400 hover:bg-white/5' : 'text-midnight-300 hover:text-cyan-600 hover:bg-ivory-100')} aria-label={isListening ? 'Stop listening' : 'Start voice input'}>
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button> */}
          <button onClick={handleSend} disabled={!hasContent || disabled} className={cn('p-2 rounded-xl shrink-0 transition-all duration-300', hasContent && !disabled ? 'bg-cyan-500 text-[#050816] shadow-cyan-glow hover:shadow-lg active:scale-95' : isDarkMode ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-midnight-100 text-midnight-300 cursor-not-allowed')}>
            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <p className={cn('text-[10px] mt-2.5 text-center', isDarkMode ? 'text-white/20' : 'text-midnight-300')}>
          Press <kbd className={cn('px-1 py-0.5 rounded text-[9px] font-mono', isDarkMode ? 'bg-white/5' : 'bg-midnight-100')}>Enter</kbd> to send,{' '}
          <kbd className={cn('px-1 py-0.5 rounded text-[9px] font-mono', isDarkMode ? 'bg-white/5' : 'bg-midnight-100')}>Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
