// src/components/chat/MessageBubble.tsx

import React, { useState, useCallback, memo } from 'react';
import { Message } from '../../types';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, User, Volume2, Square, Share2, Pin } from 'lucide-react';
import { cn, formatTimestamp } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

export type TtsState = 'idle' | 'playing' | 'paused';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  isDarkMode?: boolean;
  ttsState?: TtsState;
  onTtsPlay?: (messageId: string, text: string) => void;
  onTtsPause?: () => void;
  onTtsStop?: () => void;
  onShare?: () => void;
  onContextMenu?: (e: React.MouseEvent, msg: Message) => void;
  isSelected?: boolean;
  searchQuery?: string;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  index = 0,
  isDarkMode = false,
  ttsState = 'idle',
  onTtsPlay,
  onTtsPause,
  onTtsStop,
  onShare,
  onContextMenu,
  isSelected = false,
  searchQuery = '',
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, message);
  }, [onContextMenu, message]);

  /* Highlight matching text — preserves original whitespace and formatting */
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const segments = text.split(regex);
    return segments.map((segment, i) => {
      if (segment.toLowerCase() === query.toLowerCase()) {
        return <mark key={i} className="bg-yellow-200/80 text-yellow-900 rounded px-0.5 dark:bg-yellow-500/30 dark:text-yellow-200">{segment}</mark>;
      }
      return <span key={i}>{segment}</span>;
    });
  };

  /* Recursively highlight text inside markdown rendered children */
  const highlightChildren = (children: React.ReactNode, query: string): React.ReactNode => {
    if (!query.trim()) return children;
    if (typeof children === 'string') return highlightText(children, query);
    if (Array.isArray(children)) return children.map((child) => highlightChildren(child, query));
    if (children && typeof children === 'object' && (children as React.ReactElement).props?.children) {
      const el = children as React.ReactElement;
      return React.cloneElement(el, { key: el.key, children: highlightChildren(el.props.children, query) });
    }
    return children;
  };

  /* ─── Markdown renderers ─── */
  // Typed with react-markdown's Components so no `any` leaks into the map.
  // (The `code` handler narrows its props because react-markdown adds the
  // non-standard `inline` flag on top of the intrinsic `code` element props.)
  const md: Components = {
    p: ({ children }) => <p className="text-sm leading-relaxed mb-3 last:mb-0">{searchQuery ? highlightChildren(children, searchQuery) : children}</p>,
    strong: ({ children }) => <strong className="font-bold">{searchQuery ? highlightChildren(children, searchQuery) : children}</strong>,
    em: ({ children }) => <em className="italic">{searchQuery ? highlightChildren(children, searchQuery) : children}</em>,
    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-sm">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-sm">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{searchQuery ? highlightChildren(children, searchQuery) : children}</li>,
    a: ({ href, title, children }) => (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer" className={cn("underline underline-offset-2 font-medium", isDarkMode ? "text-green-400 hover:text-green-300" : "text-green-600 hover:text-green-700")}>{children}</a>
    ),
    code: (props) => {
      const { inline = false, className, children } = props as { inline?: boolean; className?: string; children?: React.ReactNode };
      if (inline) return <code className={cn("px-1.5 py-0.5 rounded-md text-[13px] font-mono", isDarkMode ? "bg-white/10 text-green-300" : "bg-green-100 text-green-800")}>{children}</code>;
      return (
        <div className="relative mb-3">
          <div className={cn("flex items-center px-4 py-1.5 text-[10px] font-mono rounded-t-lg border border-b-0", isDarkMode ? "bg-white/5 text-white/40 border-white/10" : "bg-gray-50 text-gray-500 border-gray-200")}><span>code</span></div>
          <pre className={cn("p-4 rounded-b-lg overflow-x-auto text-[13px] font-mono leading-relaxed border", isDarkMode ? "bg-[#0a0a0a] text-green-300 border-white/10" : "bg-gray-50 text-gray-800 border-gray-200")}><code className={className}>{children}</code></pre>
        </div>
      );
    },
    pre: ({ children }) => <pre>{children}</pre>,
    h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-1">{children}</h3>,
    blockquote: ({ children }) => (
      <blockquote className={cn("border-l-2 pl-4 py-1 mb-3 italic", isDarkMode ? "border-green-500/40 text-white/60" : "border-green-400 text-gray-600")}>{children}</blockquote>
    ),
    hr: () => <hr className={cn("my-4 border-0 h-px", isDarkMode ? "bg-white/10" : "bg-gray-200")} />,
    table: ({ style, children }) => <div className="overflow-x-auto mb-3"><table style={style} className={cn("w-full text-sm border-collapse", isDarkMode ? "text-white/70" : "text-gray-700")}>{children}</table></div>,
    th: ({ style, children }) => <th style={style} className={cn("px-3 py-2 text-left text-xs font-semibold border-b", isDarkMode ? "border-white/10 text-white/50" : "border-gray-200 text-gray-500")}>{children}</th>,
    td: ({ style, children }) => <td style={style} className={cn("px-3 py-2 border-b", isDarkMode ? "border-white/5" : "border-gray-100")}>{children}</td>,
  };

  /* ─── Button styles ─── */
  const actionBtn = cn(
    "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150",
    isDarkMode
      ? "text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
  );
  const actionBtnActive = cn(
    "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150",
    isDarkMode
      ? "text-green-400 bg-green-500/10"
      : "text-green-600 bg-green-50"
  );
  const ttsBtn = actionBtn;
  const ttsBtnActive = actionBtnActive;

  return (
    <div
      className={cn("w-full", isUser ? "flex justify-end" : "", isUser ? "msg-slide-right" : "msg-slide-left")}
      style={{ animationDelay: `${index * 0.08}s` }}
      onContextMenu={handleContextMenu}
    >
      {isUser ? (
        <div className="max-w-[75%] md:max-w-[65%]">
          {/* Pin indicator */}
          {message.pinned && (
            <div className={cn("flex items-center gap-1 mb-1.5 text-[10px] font-medium justify-end", isDarkMode ? "text-green-400/60" : "text-green-600/70")}>
              <Pin className="w-3 h-3 fill-green-500 text-green-500" />
              <span>Pinned</span>
            </div>
          )}
          <div className="flex items-center gap-2 mb-2 justify-end">
            <span className={cn("text-[10px] font-medium tracking-wider uppercase", isDarkMode ? "text-white/30" : "text-midnight-300")}>{formatTimestamp(message.timestamp)}</span>
            <span className={cn("text-[10px] font-semibold tracking-wider uppercase", isDarkMode ? "text-green-400/70" : "text-green-600")}>You</span>
            <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center shadow-sm"><User className="w-3 h-3 text-white" /></div>
          </div>
          <div className={cn("rounded-2xl rounded-tr-md px-5 py-4 transition-all duration-300 cursor-default", isSelected && "ring-2 ring-green-400/50", isDarkMode ? "bg-[#2f2f2f] border border-[#424242] text-[#ececec]" : "bg-green-50 border border-green-200 text-midnight-900")}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap cursor-default select-text">{searchQuery ? highlightText(message.content, searchQuery) : message.content}</p>
          </div>
        </div>
      ) : (
        <div className="max-w-[80%] md:max-w-[72%]">
          {/* Pin indicator */}
          {message.pinned && (
            <div className={cn("flex items-center gap-1 mb-1.5 text-[10px] font-medium", isDarkMode ? "text-green-400/60" : "text-green-600/70")}>
              <Pin className="w-3 h-3 fill-green-500 text-green-500" />
              <span>Pinned</span>
            </div>
          )}
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden", isDarkMode ? "bg-[#2f2f2f] border border-[#424242]" : "bg-green-50 border border-green-200")}>
              <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className={cn("text-[10px] font-semibold tracking-wider uppercase", isDarkMode ? "text-green-400/70" : "text-green-600")}>NetKathir</span>
            <span className={cn("text-[10px] font-medium tracking-wider uppercase", isDarkMode ? "text-white/25" : "text-midnight-300")}>{formatTimestamp(message.timestamp)}</span>
          </div>

          {/* Bubble */}
          <div className={cn("rounded-2xl rounded-tl-md px-6 py-5 transition-all duration-300", isSelected && "ring-2 ring-green-400/50", isDarkMode ? "bg-[#2f2f2f] border border-[#424242]" : "bg-white border border-green-100 shadow-card")}>
            <div className={cn("prose-custom cursor-default select-text", isDarkMode ? "text-white/80" : "text-midnight-800")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{message.content}</ReactMarkdown>
            </div>
          </div>

          {/* Always-visible action bar */}
          <div className="flex items-center gap-1 mt-1.5">
            <button onClick={handleCopy} className={copied ? actionBtnActive : actionBtn} aria-label="Copy message">
              {copied ? <Check className="w-[15px] h-[15px]" /> : <Copy className="w-[15px] h-[15px]" />}
            </button>
            {onTtsPlay && (
              <>
                {ttsState === 'idle' && (
                  <button onClick={() => onTtsPlay(message.id, message.content)} className={ttsBtn} aria-label="Play TTS">
                    <Volume2 className="w-[15px] h-[15px]" />
                  </button>
                )}
                {ttsState === 'playing' && (
                  <>
                    <button onClick={onTtsPause} className={ttsBtnActive} aria-label="Pause TTS">
                      <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    </button>
                    <button onClick={onTtsStop} className={ttsBtn} aria-label="Stop TTS">
                      <Square className="w-[13px] h-[13px] fill-current" />
                    </button>
                  </>
                )}
                {ttsState === 'paused' && (
                  <>
                    <button onClick={() => onTtsPlay(message.id, message.content)} className={ttsBtnActive} aria-label="Resume TTS">
                      <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                    </button>
                    <button onClick={onTtsStop} className={ttsBtn} aria-label="Stop TTS">
                      <Square className="w-[13px] h-[13px] fill-current" />
                    </button>
                  </>
                )}
              </>
            )}
            {onShare && (
              <button onClick={onShare} className={actionBtn} aria-label="Share">
                <Share2 className="w-[15px] h-[15px]" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
