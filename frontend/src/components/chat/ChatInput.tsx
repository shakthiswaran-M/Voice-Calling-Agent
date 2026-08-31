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
  isDarkMode = true,
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
        140
      )}px`;
    }
  };

  const hasContent = message.trim().length > 0;

  const inputBg = isDarkMode ? 'bg-white/3' : 'bg-white';
  const inputBorder = isDarkMode
    ? 'border-white/8'
    : 'border-midnight-200/60';

  const inputBorderFocus = isDarkMode
    ? 'border-[#4CAF50]/40 shadow-[0_0_18px_rgba(76,175,80,0.12)] bg-white/5'
    : 'border-[#4CAF50]/50 shadow-[0_0_18px_rgba(76,175,80,0.12)] bg-white';

  const textColor = isDarkMode ? 'text-white' : 'text-midnight-900';

  const placeholderColor = isDarkMode
    ? 'placeholder:text-white/30'
    : 'placeholder:text-midnight-300';

  const voiceButtonStyle = isRecording
    ? 'bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-pulse'
    : isDarkMode
      ? 'text-white/40 hover:text-[#4CAF50] hover:bg-[#4CAF50]/10'
      : 'text-midnight-300 hover:text-[#4CAF50] hover:bg-[#4CAF50]/10';

  const sendButtonStyle =
    hasContent && !disabled
      ? 'bg-[#4CAF50] text-white shadow-[0_0_14px_rgba(76,175,80,0.25)] hover:shadow-lg active:scale-95'
      : isDarkMode
        ? 'bg-white/5 text-white/20 cursor-not-allowed'
        : 'bg-midnight-100 text-midnight-300 cursor-not-allowed';

  if (isCentered) {
    return (
      <div
        className="w-full max-w-4xl mx-auto px-6 slide-up-enter"
        style={{ animationDelay: '0.3s' }}
      >
        <div
          className={cn(
            'relative rounded-2xl border transition-all duration-300',
            isFocused || isRecording
              ? inputBorderFocus
              : `${inputBg} ${
                  isDarkMode
                    ? 'border-white/10'
                    : 'border-midnight-200/60'
                }`
          )}
        >
          {isRecording && (
            <div
              className={cn(
                'absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full',
                isDarkMode
                  ? 'bg-[#4CAF50]/10 border border-[#4CAF50]/20'
                  : 'bg-green-50 border border-green-200'
              )}
            >
              <span className="w-2 h-2 rounded-full bg-[#4CAF50] animate-pulse" />

              <span className="text-[11px] text-[#4CAF50] font-medium">
                Listening...
              </span>

              <button
                onClick={onVoiceToggle}
                className="text-[#4CAF50]/60 hover:text-[#4CAF50] ml-1"
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
              'w-full resize-none bg-transparent text-base focus:outline-none border-none px-6 py-5 pr-24 max-h-[140px] leading-relaxed font-light',
              textColor,
              placeholderColor
            )}
          />

          <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
            <button
              onClick={onVoiceToggle}
              disabled={disabled}
              aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
              className={cn(
                'p-2.5 rounded-xl transition-all duration-300',
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
        </div>

        <p
          className={cn(
            'text-[10px] mt-3 text-center',
            isDarkMode ? 'text-white/20' : 'text-midnight-300'
          )}
        >
          Press{' '}
          <kbd
            className={cn(
              'px-1 py-0.5 rounded text-[9px] font-mono',
              isDarkMode ? 'bg-white/5' : 'bg-midnight-100'
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
          ? 'border-white/5 bg-[#0A1628]/80'
          : 'border-midnight-100/50 bg-white/80'
      )}
    >
      <div className="max-w-5xl mx-auto px-6 py-4">
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
              'flex-1 resize-none bg-transparent text-sm focus:outline-none border-none py-3 pl-4 max-h-[140px] leading-relaxed',
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
              'p-2.5 rounded-xl transition-all duration-300',
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
            'text-[10px] mt-2.5 text-center',
            isDarkMode ? 'text-white/20' : 'text-midnight-300'
          )}
        >
          Press{' '}
          <kbd
            className={cn(
              'px-1 py-0.5 rounded text-[9px] font-mono',
              isDarkMode ? 'bg-white/5' : 'bg-midnight-100'
            )}
          >
            Enter
          </kbd>{' '}
          to send,{' '}
          <kbd
            className={cn(
              'px-1 py-0.5 rounded text-[9px] font-mono',
              isDarkMode ? 'bg-white/5' : 'bg-midnight-100'
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
