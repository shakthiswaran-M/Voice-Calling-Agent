// src/components/chat/MessageBubble.tsx

import { useState, useRef, useEffect } from 'react';
import { Message } from '../../types';
import { formatTimestamp } from '../../store/useChatStore';
import {
  Copy,
  RefreshCw,
  Check,
  User,
  MoreHorizontal,
  ThumbsUp,
  ThumbsDown,
  Share2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  isDarkMode?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, index = 0, isDarkMode = false, onRegenerate }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === 'user';

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyFromMenu = () => {
    handleCopy();
    setShowMenu(false);
  };

  const handleRegenerateFromMenu = () => {
    onRegenerate?.();
    setShowMenu(false);
  };

  const menuItems = [
    {
      icon: copied ? Check : Copy,
      label: copied ? 'Copied!' : 'Copy',
      onClick: handleCopyFromMenu,
    },
    ...(onRegenerate
      ? [
          {
            icon: RefreshCw,
            label: 'Regenerate',
            onClick: handleRegenerateFromMenu,
          },
        ]
      : []),
    {
      icon: Share2,
      label: 'Share',
      onClick: () => setShowMenu(false),
    },
  ];

  const firstLetter = message.content.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'w-full',
        isUser ? 'flex justify-end' : '',
        isUser ? 'msg-slide-right' : 'msg-slide-left'
      )}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {isUser ? (
        <div className="max-w-[75%] md:max-w-[65%]">
          <div className={cn('flex items-center gap-2 mb-2 justify-end')}>
            <span className={cn(
              'text-[10px] font-medium tracking-wider uppercase',
              isDarkMode ? 'text-white/30' : 'text-midnight-300'
            )}>
              {formatTimestamp(message.timestamp)}
            </span>
            <span className={cn(
              'text-[10px] font-semibold tracking-wider uppercase',
              isDarkMode ? 'text-green-400/70' : 'text-green-600'
            )}>
              You
            </span>
            <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center shadow-sm">
              <User className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className={cn(
            'rounded-2xl rounded-tr-md px-5 py-4 transition-all duration-300 cursor-default',
            isDarkMode
              ? 'bg-green-500/10 border border-green-500/20 text-white'
              : 'bg-green-50 border border-green-200 text-midnight-900'
          )}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap cursor-default select-text">{message.content}</p>
          </div>
        </div>
      ) : (
        <div className="max-w-[80%] md:max-w-[72%]">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden',
              isDarkMode
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-green-50 border border-green-200'
            )}>
              <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className={cn(
              'text-[10px] font-semibold tracking-wider uppercase',
              isDarkMode ? 'text-green-400/70' : 'text-green-600'
            )}>
              NetKathir
            </span>
            <span className={cn(
              'text-[10px] font-medium tracking-wider uppercase',
              isDarkMode ? 'text-white/25' : 'text-midnight-300'
            )}>
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <div className={cn(
            'rounded-2xl rounded-tl-md px-6 py-5 transition-all duration-300 group',
            isDarkMode
              ? 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05]'
              : 'bg-white border border-green-100 shadow-card hover:shadow-card-hover'
          )}>
            {/* Message content */}
            <div className="mb-1 cursor-default">
              <span className={cn(
                'initial-letter select-none',
                !isDarkMode && 'initial-letter-light'
              )}>{firstLetter}</span>
              <span className={cn(
                'text-sm leading-relaxed whitespace-pre-wrap select-text',
                isDarkMode ? 'text-white/80' : 'text-midnight-800'
              )}>
                {message.content.slice(1)}
              </span>
            </div>

            {/* Action bar — ChatGPT style */}
            <div className={cn(
              'flex items-center justify-between mt-3 pt-3',
              isDarkMode ? 'border-t border-white/5' : 'border-t border-green-100/50'
            )}>
              {/* Left: feedback + copy */}
              <div className="flex items-center gap-0.5">
                {/* Thumbs Up */}
                <button
                  onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-200',
                    feedback === 'up'
                      ? 'text-green-500 bg-green-50 dark:bg-green-500/10'
                      : isDarkMode
                        ? 'text-white/20 hover:text-white/50 hover:bg-white/5'
                        : 'text-midnight-200 hover:text-green-600 hover:bg-green-50'
                  )}
                  aria-label="Good response"
                  title="Good response"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>

                {/* Thumbs Down */}
                <button
                  onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-200',
                    feedback === 'down'
                      ? 'text-red-500 bg-red-50 dark:bg-red-500/10'
                      : isDarkMode
                        ? 'text-white/20 hover:text-white/50 hover:bg-white/5'
                        : 'text-midnight-200 hover:text-red-500 hover:bg-red-50'
                  )}
                  aria-label="Bad response"
                  title="Bad response"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>

                {/* Copy */}
                <button
                  onClick={handleCopy}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-200',
                    copied
                      ? isDarkMode
                        ? 'text-green-400 bg-green-500/10'
                        : 'text-green-600 bg-green-50'
                      : isDarkMode
                        ? 'text-white/20 hover:text-white/50 hover:bg-white/5'
                        : 'text-midnight-200 hover:text-green-600 hover:bg-green-50'
                  )}
                  aria-label="Copy message"
                  title="Copy"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Right: 3-dot menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-200',
                    showMenu
                      ? isDarkMode
                        ? 'text-white/60 bg-white/10'
                        : 'text-green-600 bg-green-50'
                      : isDarkMode
                        ? 'text-white/20 hover:text-white/50 hover:bg-white/5'
                        : 'text-midnight-200 hover:text-green-600 hover:bg-green-50'
                  )}
                  aria-label="More options"
                  title="More"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {/* Dropdown menu */}
                {showMenu && (
                  <div
                    className={cn(
                      'absolute right-0 bottom-full mb-2 z-50',
                      'w-44 py-1.5 rounded-xl',
                      'border shadow-lg',
                      'animate-scale-in',
                      'origin-bottom-right',
                      isDarkMode
                        ? 'bg-[#1a2e20] border-green-500/20 shadow-black/40'
                        : 'bg-white border-green-100 shadow-float'
                    )}
                  >
                    {menuItems.map((item, i) => (
                      <button
                        key={i}
                        onClick={item.onClick}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium',
                          'transition-all duration-150',
                          isDarkMode
                            ? 'text-white/70 hover:bg-green-500/10 hover:text-white'
                            : 'text-midnight-700 hover:bg-green-50 hover:text-green-700'
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}