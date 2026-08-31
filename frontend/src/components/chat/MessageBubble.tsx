// src/components/chat/MessageBubble.tsx

import { useState } from 'react';
import { Message } from '../../types';
import { formatTimestamp } from '../../store/useChatStore';
import { Copy, RefreshCw, Check, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  isDarkMode?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, index = 0, isDarkMode = true, onRegenerate }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstLetter = message.content.charAt(0).toUpperCase();

  return (
    <div
      className={cn('w-full', isUser ? 'flex justify-end' : '', isUser ? 'msg-slide-right' : 'msg-slide-left')}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {isUser ? (
        <div className="max-w-[75%] md:max-w-[65%]">
          <div className={cn('flex items-center gap-2 mb-2 justify-end')}>
            <span className={cn('text-[10px] font-medium tracking-wider uppercase', isDarkMode ? 'text-white/30' : 'text-midnight-300')}>
              {formatTimestamp(message.timestamp)}
            </span>
            <span className={cn('text-[10px] font-semibold tracking-wider uppercase', isDarkMode ? 'text-cyan-400/60' : 'text-cyan-600/70')}>
              You
            </span>
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center shadow-sm">
              <User className="w-3 h-3 text-[#050816]" />
            </div>
          </div>
          <div className={cn('rounded-2xl rounded-tr-md px-5 py-4', isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/20 text-white' : 'bg-cyan-50 border border-cyan-200 text-midnight-900')}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      ) : (
        <div className="max-w-[80%] md:max-w-[72%]">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center overflow-hidden', isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white border border-midnight-100')}>
              <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className={cn('text-[10px] font-semibold tracking-wider uppercase', isDarkMode ? 'text-cyan-400/60' : 'text-cyan-600/70')}>
              netKathir
            </span>
            <span className={cn('text-[10px] font-medium tracking-wider uppercase', isDarkMode ? 'text-white/25' : 'text-midnight-300')}>
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <div className={cn('rounded-2xl rounded-tl-md px-6 py-5 transition-colors duration-300', isDarkMode ? 'bg-white/3 border border-white/6 hover:bg-white/5' : 'bg-white border border-midnight-100/50 shadow-sm hover:shadow-md')}>
            <div className="mb-1">
              <span className={cn('initial-letter select-none', !isDarkMode && 'initial-letter-light')}>{firstLetter}</span>
              <span className={cn('text-sm leading-relaxed whitespace-pre-wrap', isDarkMode ? 'text-white/80' : 'text-midnight-800')}>
                {message.content.slice(1)}
              </span>
            </div>
            <div className={cn('flex items-center gap-1 mt-4 pt-3', isDarkMode ? 'border-t border-white/5' : 'border-t border-midnight-100/50')}>
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200',
                  copied
                    ? isDarkMode ? 'text-cyan-400 bg-cyan-400/10' : 'text-cyan-600 bg-cyan-50'
                    : isDarkMode ? 'text-white/30 hover:text-white/60 hover:bg-white/5' : 'text-midnight-300 hover:text-midnight-600 hover:bg-ivory-100'
                )}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200',
                    isDarkMode ? 'text-white/30 hover:text-white/60 hover:bg-white/5' : 'text-midnight-300 hover:text-midnight-600 hover:bg-ivory-100'
                  )}
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}