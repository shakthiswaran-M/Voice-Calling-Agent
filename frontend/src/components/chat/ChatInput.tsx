import React, { useState, useRef } from 'react';
import { Mic, MicOff, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isCentered?: boolean;
  isDarkMode?: boolean;
  onVoiceToggle?: () => void;
  isRecording?: boolean;
}

export function ChatInput({
  onSend,
  disabled = false,
  isCentered = false,
  isDarkMode = false,
  onVoiceToggle,
  isRecording = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const textToSend = message.trim();
    if (textToSend && !disabled) {
      onSend(textToSend);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  };

  const hasContent = message.trim().length > 0;

  const inputBg = isDarkMode ? 'bg-white/[0.03]' : 'bg-white';
  const inputBorder = isDarkMode ? 'border-white/10' : 'border-green-200/60';
  const inputBorderFocus = isDarkMode
    ? 'border-green-500/40 shadow-input-focus bg-white/[0.05]'
    : 'border-green-400 shadow-input-focus bg-white';

  const textColor = isDarkMode ? 'text-white' : 'text-midnight-900';
  const placeholderColor = isDarkMode
    ? 'placeholder:text-white/30'
    : 'placeholder:text-midnight-300';

  const voiceButtonStyle = isRecording
    ? 'bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-pulse'
    : isDarkMode
      ? 'text-white/40 hover:text-green-400 hover:bg-green-500/10'
      : 'text-midnight-300 hover:text-green-600 hover:bg-green-50';

  const sendButtonStyle =
    hasContent && !disabled
      ? 'bg-green-500 text-white shadow-btn hover:shadow-btn-hover hover:bg-green-600 active:scale-90 transition-all duration-300'
      : isDarkMode
        ? 'bg-white/5 text-white/20 cursor-not-allowed'
        : 'bg-green-100 text-green-300 cursor-not-allowed';

  if (isCentered) {
    return (
      <div
        className="w-full max-w-3xl mx-auto px-4 sm:px-6 slide-up-enter"
        style={{ animationDelay: '0.3s' }}
      >
        <div
          className={cn(
            'relative rounded-2xl border transition-all duration-300',
            isFocused || isRecording
              ? inputBorderFocus
              : `${inputBg} ${
                  isDarkMode ? 'border-white/10' : 'border-green-200/60'
                }`
          )}
        >
          {isRecording && (
            <div
              className={cn(
                'absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full animate-slide-down',
                isDarkMode
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-green-50 border border-green-200'
              )}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] text-green-500 font-medium">
                Listening...
              </span>
              <button
                onClick={onVoiceToggle}
                className="text-green-500/60 hover:text-green-500 ml-1 transition-colors"
                aria-label="Stop recording"
              >
                <MicOff className="w-3 h-3" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isRecording ? 'Listening...' : 'Ask me anything...'}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent text-sm sm:text-base focus:outline-none border-none px-4 sm:px-6 py-4 sm:py-5 pr-20 sm:pr-24 max-h-[120px] leading-relaxed font-light',
              textColor,
              placeholderColor
            )}
          />

          <div className="absolute right-2 sm:right-3 bottom-2 sm:bottom-3 flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={onVoiceToggle}
              disabled={disabled}
              aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
              className={cn(
                'p-2 sm:p-2.5 rounded-xl transition-all duration-300 active:scale-90',
                voiceButtonStyle,
                disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={handleSend}
              disabled={!hasContent || disabled}
              aria-label="Send message"
              className={cn(
                'p-2 sm:p-2 rounded-xl shrink-0 transition-all duration-300',
                sendButtonStyle
              )}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <p
          className={cn(
            'text-[10px] mt-2.5 text-center hidden sm:block',
            isDarkMode ? 'text-white/20' : 'text-midnight-300'
          )}
        >
          Press{' '}
          <kbd
            className={cn(
              'px-1.5 py-0.5 rounded-md text-[9px] font-mono',
              isDarkMode ? 'bg-white/5 text-white/30' : 'bg-green-100/50 text-green-700/50'
            )}
          >
            Enter
          </kbd>{' '}
          to send, or click the mic to speak
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-t backdrop-blur-md',
        isDarkMode
          ? 'border-green-500/10 bg-[#050F0A]/80'
          : 'border-green-100 bg-white/80'
      )}
    >
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        <div
          className={cn(
            'flex items-center gap-1 rounded-2xl border transition-all duration-300 pr-1',
            isFocused || isRecording
              ? inputBorderFocus
              : `${inputBg} ${inputBorder}`
          )}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={
              isRecording ? 'Listening...' : 'Type your message...'
            }
            disabled={disabled}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm focus:outline-none border-none py-3 pl-3 sm:pl-4 max-h-[120px] leading-relaxed',
              textColor,
              placeholderColor
            )}
          />

          <button
            onClick={onVoiceToggle}
            disabled={disabled}
            aria-label={
              isRecording ? 'Stop recording' : 'Start voice input'
            }
            className={cn(
              'p-2 sm:p-2.5 rounded-xl transition-all duration-300 active:scale-90',
              voiceButtonStyle,
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {isRecording ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={handleSend}
            disabled={!hasContent || disabled}
            aria-label="Send message"
            className={cn(
              'p-2 rounded-xl shrink-0 transition-all duration-300',
              sendButtonStyle
            )}
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <p
          className={cn(
            'text-[10px] mt-2 text-center hidden sm:block',
            isDarkMode ? 'text-white/20' : 'text-midnight-300'
          )}
        >
          Press{' '}
          <kbd
            className={cn(
              'px-1.5 py-0.5 rounded-md text-[9px] font-mono',
              isDarkMode ? 'bg-white/5 text-white/30' : 'bg-green-100/50 text-green-700/50'
            )}
          >
            Enter
          </kbd>{' '}
          to send,{' '}
          <kbd
            className={cn(
              'px-1.5 py-0.5 rounded-md text-[9px] font-mono',
              isDarkMode ? 'bg-white/5 text-white/30' : 'bg-green-100/50 text-green-700/50'
            )}
          >
            Shift+Enter
          </kbd>{' '}
          for new line, or click the mic to speak
        </p>
      </div>
    </div>
  );
}