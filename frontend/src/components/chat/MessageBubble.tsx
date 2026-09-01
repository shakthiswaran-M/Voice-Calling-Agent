// src/components/chat/MessageBubble.tsx

import { useState } from 'react';
import { Message } from '../../types';
import { formatTimestamp } from '../../store/useChatStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, User, Volume2, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

export type TtsState = 'idle' | 'playing' | 'paused';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  isDarkMode?: boolean;
  ttsState?: TtsState;
  onTtsPlay?: () => void;
  onTtsPause?: () => void;
  onTtsStop?: () => void;
}

export function MessageBubble({
  message,
  index = 0,
  isDarkMode = false,
  ttsState = 'idle',
  onTtsPlay,
  onTtsPause,
  onTtsStop,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ─── Markdown renderers ─── */
  const md: Record<string, any> = {
    p: ({ children, ...p }: any) => <p className="text-sm leading-relaxed mb-3 last:mb-0" {...p}>{children}</p>,
    strong: ({ children, ...p }: any) => <strong className="font-bold" {...p}>{children}</strong>,
    em: ({ children, ...p }: any) => <em className="italic" {...p}>{children}</em>,
    ul: ({ children, ...p }: any) => <ul className="list-disc list-inside mb-3 space-y-1 text-sm" {...p}>{children}</ul>,
    ol: ({ children, ...p }: any) => <ol className="list-decimal list-inside mb-3 space-y-1 text-sm" {...p}>{children}</ol>,
    li: ({ children, ...p }: any) => <li className="leading-relaxed" {...p}>{children}</li>,
    a: ({ href, children, ...p }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn("underline underline-offset-2 font-medium", isDarkMode ? "text-green-400 hover:text-green-300" : "text-green-600 hover:text-green-700")} {...p}>{children}</a>
    ),
    code: ({ inline, className, children, ...p }: any) => {
      if (inline) return <code className={cn("px-1.5 py-0.5 rounded-md text-[13px] font-mono", isDarkMode ? "bg-white/10 text-green-300" : "bg-green-100 text-green-800")} {...p}>{children}</code>;
      return (
        <div className="relative mb-3">
          <div className={cn("flex items-center px-4 py-1.5 text-[10px] font-mono rounded-t-lg border border-b-0", isDarkMode ? "bg-white/5 text-white/40 border-white/10" : "bg-gray-50 text-gray-500 border-gray-200")}><span>code</span></div>
          <pre className={cn("p-4 rounded-b-lg overflow-x-auto text-[13px] font-mono leading-relaxed border", isDarkMode ? "bg-[#0a0a0a] text-green-300 border-white/10" : "bg-gray-50 text-gray-800 border-gray-200")}><code className={className} {...p}>{children}</code></pre>
        </div>
      );
    },
    pre: ({ children, ...p }: any) => <pre {...p}>{children}</pre>,
    h1: ({ children, ...p }: any) => <h1 className="text-lg font-bold mb-3 mt-2" {...p}>{children}</h1>,
    h2: ({ children, ...p }: any) => <h2 className="text-base font-bold mb-2 mt-2" {...p}>{children}</h2>,
    h3: ({ children, ...p }: any) => <h3 className="text-sm font-bold mb-2 mt-1" {...p}>{children}</h3>,
    blockquote: ({ children, ...p }: any) => (
      <blockquote className={cn("border-l-2 pl-4 py-1 mb-3 italic", isDarkMode ? "border-green-500/40 text-white/60" : "border-green-400 text-gray-600")} {...p}>{children}</blockquote>
    ),
    hr: (p: any) => <hr className={cn("my-4 border-0 h-px", isDarkMode ? "bg-white/10" : "bg-gray-200")} {...p} />,
    table: ({ children, ...p }: any) => <div className="overflow-x-auto mb-3"><table className={cn("w-full text-sm border-collapse", isDarkMode ? "text-white/70" : "text-gray-700")} {...p}>{children}</table></div>,
    th: ({ children, ...p }: any) => <th className={cn("px-3 py-2 text-left text-xs font-semibold border-b", isDarkMode ? "border-white/10 text-white/50" : "border-gray-200 text-gray-500")} {...p}>{children}</th>,
    td: ({ children, ...p }: any) => <td className={cn("px-3 py-2 border-b", isDarkMode ? "border-white/5" : "border-gray-100")} {...p}>{children}</td>,
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
  const ttsBtn = cn(
    "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150",
    isDarkMode
      ? "text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
  );
  const ttsBtnActive = cn(
    "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150",
    isDarkMode
      ? "text-green-400 bg-green-500/10"
      : "text-green-600 bg-green-50"
  );

  return (
    <div
      className={cn("w-full", isUser ? "flex justify-end" : "", isUser ? "msg-slide-right" : "msg-slide-left")}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {isUser ? (
        <div className="max-w-[75%] md:max-w-[65%]">
          <div className="flex items-center gap-2 mb-2 justify-end">
            <span className={cn("text-[10px] font-medium tracking-wider uppercase", isDarkMode ? "text-white/30" : "text-midnight-300")}>{formatTimestamp(message.timestamp)}</span>
            <span className={cn("text-[10px] font-semibold tracking-wider uppercase", isDarkMode ? "text-green-400/70" : "text-green-600")}>You</span>
            <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center shadow-sm"><User className="w-3 h-3 text-white" /></div>
          </div>
          <div className={cn("rounded-2xl rounded-tr-md px-5 py-4 transition-all duration-300 cursor-default", isDarkMode ? "bg-green-500/10 border border-green-500/20 text-white" : "bg-green-50 border border-green-200 text-midnight-900")}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap cursor-default select-text">{message.content}</p>
          </div>
        </div>
      ) : (
        <div className="max-w-[80%] md:max-w-[72%]">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden", isDarkMode ? "bg-green-500/10 border border-green-500/20" : "bg-green-50 border border-green-200")}>
              <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className={cn("text-[10px] font-semibold tracking-wider uppercase", isDarkMode ? "text-green-400/70" : "text-green-600")}>NetKathir</span>
            <span className={cn("text-[10px] font-medium tracking-wider uppercase", isDarkMode ? "text-white/25" : "text-midnight-300")}>{formatTimestamp(message.timestamp)}</span>
          </div>

          {/* Bubble */}
          <div className={cn("rounded-2xl rounded-tl-md px-6 py-5 transition-all duration-300", isDarkMode ? "bg-white/[0.03] border border-white/[0.06]" : "bg-white border border-green-100 shadow-card")}>
            <div className={cn("prose-custom cursor-default select-text", isDarkMode ? "text-white/80" : "text-midnight-800")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{message.content}</ReactMarkdown>
            </div>
          </div>

          {/* Always-visible action bar */}
          <div className="flex items-center gap-1 mt-1.5">
            {/* Copy */}
            <button onClick={handleCopy} className={copied ? actionBtnActive : actionBtn} aria-label="Copy message">
              {copied ? <Check className="w-[15px] h-[15px]" /> : <Copy className="w-[15px] h-[15px]" />}
            </button>

            {/* TTS Play / Pause / Stop */}
            {onTtsPlay && (
              <>
                {ttsState === 'idle' && (
                  <button onClick={onTtsPlay} className={ttsBtn} aria-label="Play TTS">
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
                    <button onClick={onTtsPlay} className={ttsBtnActive} aria-label="Resume TTS">
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
          </div>
        </div>
      )}
    </div>
  );
}
