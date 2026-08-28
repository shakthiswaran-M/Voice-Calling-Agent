// src/components/chat/ChatArea.tsx

import { useEffect, useState } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ArrowDown, Menu, Mic, /*Brain, Shield,*/ Users, Briefcase, Globe, Award } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendChatMessage, ApiError } from '../../lib/api';

const FALLBACK_ERROR_RESPONSE =
  "Sorry, I couldn't reach the assistant just now. Please check that the backend is running and try again.";

/* ── CSS Robot Character ── */
function AiRobot() {
  return (
    <div className="robot-wrapper">
      <div className="robot-glow-ring robot-glow-ring-1" />
      <div className="robot-glow-ring robot-glow-ring-2" />
      <div className="robot-glow-ring robot-glow-ring-3" />
      <div className="robot-platform">
        <div className="robot-platform-ring" />
      </div>
      <div className="robot-body">
        <div className="robot-antenna">
          <div className="robot-antenna-stem" />
          <div className="robot-antenna-tip" />
          <div className="robot-antenna-glow" />
        </div>
        <div className="robot-head">
          <div className="robot-face">
            <div className="robot-eyes">
              <div className="robot-eye robot-eye-left">
                <div className="robot-pupil" />
                <div className="robot-eye-shine" />
              </div>
              <div className="robot-eye robot-eye-right">
                <div className="robot-pupil" />
                <div className="robot-eye-shine" />
              </div>
            </div>
            <div className="robot-mouth" />
            <div className="robot-cheek robot-cheek-left" />
            <div className="robot-cheek robot-cheek-right" />
          </div>
          <div className="robot-head-shine" />
        </div>
        <div className="robot-ear robot-ear-left" />
        <div className="robot-ear robot-ear-right" />
        <div className="robot-torso">
          <div className="robot-chest-light" />
          <div className="robot-chest-ring" />
          <div className="robot-body-shine" />
        </div>
        <div className="robot-arm robot-arm-left">
          <div className="robot-hand" />
        </div>
        <div className="robot-arm robot-arm-right">
          <div className="robot-hand" />
        </div>
      </div>
    </div>
  );
}

export function ChatArea() {
  const { threads, activeThreadId, addMessage, updateMessage, createThread, updateThreadTitle, setThreadSessionId, toggleSidebar, isDarkMode } = useChatStore();
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];
  const { containerRef, showScrollButton, handleScroll, scrollToBottom, scrollToBottomOnSend } = useAutoScroll([messages.length]);
  const [startListening, setStartListening] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (content: string) => {
    const threadId = activeThreadId || createThread().id;
    const thread = useChatStore.getState().threads.find((t) => t.id === threadId);
    if (thread && thread.messages.length === 0) {
      const title = content.length > 40 ? content.substring(0, 40) + '...' : content;
      updateThreadTitle(threadId, title);
    }
    addMessage(threadId, { role: 'user', content });
    scrollToBottomOnSend();

    setIsSending(true);
    try {
      const { reply, session_id } = await sendChatMessage(content, thread?.sessionId);
      if (!thread?.sessionId) setThreadSessionId(threadId, session_id);
      addMessage(threadId, { role: 'bot', content: reply || "(no response)" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : FALLBACK_ERROR_RESPONSE;
      addMessage(threadId, { role: 'bot', content: message });
    } finally {
      setIsSending(false);
    }
  };

  const handleStartConversation = () => {
    setStartListening(true);
    setTimeout(() => setStartListening(false), 100);
  };

  useEffect(() => {
    if (!activeThreadId && threads.length === 0) createThread();
  }, [activeThreadId, threads.length, createThread]);

  const handleRegenerate = async (messageId: string) => {
    if (!activeThreadId || !activeThread) return;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) return;

    setIsSending(true);
    try {
      const { reply, session_id } = await sendChatMessage(lastUserMessage.content, activeThread.sessionId);
      if (!activeThread.sessionId) setThreadSessionId(activeThreadId, session_id);
      updateMessage(activeThreadId, messageId, reply || '(no response)');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : FALLBACK_ERROR_RESPONSE;
      updateMessage(activeThreadId, messageId, message);
    } finally {
      setIsSending(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {hasMessages ? (
        <>
          {/* Mobile Header */}
          <div className={cn('lg:hidden flex items-center gap-3 px-4 py-3 border-b shrink-0', isDarkMode ? 'border-white/5' : 'border-midnight-100/50')}>
            <button onClick={toggleSidebar} className={cn('p-2 rounded-xl transition-colors', isDarkMode ? 'hover:bg-white/5' : 'hover:bg-ivory-100')} aria-label="Open sidebar">
              <Menu className={cn('w-5 h-5', isDarkMode ? 'text-white/60' : 'text-midnight-400')} />
            </button>
            <span className={cn('font-serif text-sm font-semibold truncate', isDarkMode ? 'text-white' : 'text-midnight-900')}>{activeThread?.title}</span>
          </div>

          {/* Scrollable messages */}
          <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-3xl mx-auto px-6 md:px-8 py-10 space-y-8">
              <div className="text-center mb-8 message-slide-in">
                <h2 className={cn('font-serif text-2xl md:text-3xl font-semibold tracking-tight', isDarkMode ? 'text-white' : 'text-midnight-900')}>{activeThread?.title}</h2>
                <div className="editorial-rule w-16 mx-auto mt-4" />
              </div>
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  index={i}
                  isDarkMode={isDarkMode}
                  onRegenerate={
                    activeThreadId && msg.role === 'bot' && i === messages.length - 1 && !isSending
                      ? () => handleRegenerate(msg.id)
                      : undefined
                  }
                />
              ))}
              {isSending && (
                <div className="w-full msg-slide-left">
                  <div className="max-w-[80%] md:max-w-[72%]">
                    <div className={cn('flex items-center gap-2 mb-2')}>
                      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', isDarkMode ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/20' : 'bg-gradient-to-br from-cyan-100 to-purple-100 border border-cyan-200/50')}>
                        <span className={cn('text-[10px] font-serif font-bold', isDarkMode ? 'text-cyan-400' : 'text-cyan-600')}>n</span>
                      </div>
                      <span className={cn('text-[10px] font-semibold tracking-wider uppercase', isDarkMode ? 'text-cyan-400/60' : 'text-cyan-600/70')}>netKathir</span>
                    </div>
                    <div className={cn('rounded-2xl rounded-tl-md px-6 py-5 flex items-center gap-1.5', isDarkMode ? 'bg-white/3 border border-white/6' : 'bg-white border border-midnight-100/50 shadow-sm')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isDarkMode ? 'bg-cyan-400/60' : 'bg-cyan-500/60')} style={{ animationDelay: '0ms' }} />
                      <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isDarkMode ? 'bg-cyan-400/60' : 'bg-cyan-500/60')} style={{ animationDelay: '150ms' }} />
                      <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', isDarkMode ? 'bg-cyan-400/60' : 'bg-cyan-500/60')} style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              {showScrollButton && (
                <div className="flex justify-center sticky bottom-4 z-10">
                  <button onClick={() => scrollToBottom(true)} className={cn('flex items-center gap-2 px-4 py-2 backdrop-blur-sm text-white rounded-full hover:shadow-lg transition-all duration-300', isDarkMode ? 'bg-cyan-500/90 shadow-cyan-glow' : 'bg-midnight-900 shadow-lg')}>
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">New messages</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0"><ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isDarkMode={isDarkMode} /></div>
        </>
      ) : (
        /* ═══ WELCOME: Futuristic AI Assistant ═══ */
        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0 welcome-bg">
            <div className="welcome-particle welcome-p1" />
            <div className="welcome-particle welcome-p2" />
            <div className="welcome-particle welcome-p3" />
            <div className="welcome-particle welcome-p4" />
            <div className="welcome-particle welcome-p5" />
            <div className="welcome-particle welcome-p6" />
            <div className="welcome-particle welcome-p7" />
            <div className="welcome-particle welcome-p8" />
            <div className="welcome-geo welcome-geo-1" />
            <div className="welcome-geo welcome-geo-2" />
            <div className="welcome-geo welcome-geo-3" />
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 relative z-10">
            <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

              {/* Left — Text + Features + CTA */}
              <div className="flex-1 text-center lg:text-left">
                <p className={cn('text-[11px] font-semibold tracking-[0.25em] uppercase mb-3 message-slide-in', isDarkMode ? 'text-cyan-400' : 'text-cyan-600')}>
                  Your AI-Powered Voice Assistant
                </p>
                <h1 className={cn('font-serif text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] mb-4 message-slide-in', isDarkMode ? 'text-white' : 'text-midnight-900')} style={{ animationDelay: '0.1s' }}>
                   Welcome to 
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-purple-500 mt-1">
                    NetKathir
                  </span>
                </h1>

                {/* Feature cards */}
                {/* <div className="grid grid-cols-3 gap-3 mb-6 max-w-md mx-auto lg:mx-0">
                  {[
                    { icon: Mic, label: 'Voice-First', desc: 'Speak naturally, we understand you.', color: 'cyan' },
                    { icon: Brain, label: 'AI-Powered', desc: 'Advanced intelligence for accurate answers.', color: 'purple' },
                    { icon: Shield, label: 'Secure & Private', desc: 'Your data is safe and protected.', color: 'cyan' },
                  ].map(({ icon: Icon, label, desc, color }, i) => (
                    <div
                      key={i}
                      className={`feature-card feature-card-${color} card-pop-in`}
                      style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                    >
                      <div className={`feature-icon feature-icon-${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={cn('text-[11px] font-semibold', isDarkMode ? 'text-white' : 'text-midnight-800')}>{label}</span>
                      <span className={cn('text-[9px] leading-tight', isDarkMode ? 'text-white/40' : 'text-midnight-400')}>{desc}</span>
                    </div>
                  ))}
                </div> */}

                {/* CTA buttons */}
                <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start mb-6 card-pop-in" style={{ animationDelay: '0.6s' }}>
                  <button className="cta-primary" onClick={handleStartConversation}>
                    <Mic className="w-4 h-4" />
                    Start Conversation
                  </button>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-4 justify-center lg:justify-start card-pop-in" style={{ animationDelay: '0.7s' }}>
                  {[
                    { icon: Users, value: '500+', label: 'Happy Clients' },
                    { icon: Briefcase, value: '200+', label: 'Projects Delivered' },
                    { icon: Award, value: '9+', label: 'Years of Excellence' },
                    { icon: Globe, value: 'Global', label: 'Clients' },
                  ].map(({ icon: Icon, value, label }, i) => (
                    <div key={i} className="stat-item">
                      <Icon className={cn('w-3.5 h-3.5', isDarkMode ? 'text-cyan-400/60' : 'text-cyan-600/60')} />
                      <div>
                        <span className={cn('font-bold text-xs', isDarkMode ? 'text-white' : 'text-midnight-900')}>{value}</span>
                        <span className={cn('text-[9px] block', isDarkMode ? 'text-white/30' : 'text-midnight-400')}>{label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Robot Character */}
              <div className="flex-shrink-0 relative message-slide-in" style={{ animationDelay: '0.2s' }}>
                <div className={cn('speech-bubble', !isDarkMode && 'speech-bubble-light')}>
                  <span className={cn('font-semibold text-sm', isDarkMode ? 'text-white' : 'text-midnight-900')}>Hello!</span>
                  <span className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/50' : 'text-midnight-400')}>How can I assist you today?</span>
                  <div className={cn('speech-tail', !isDarkMode && 'speech-tail-light')} />
                </div>
                <AiRobot />
                <div className={cn('listening-badge', !isDarkMode && 'listening-badge-light')}>
                  <span className="listening-dot" />
                  <span className={cn('text-[10px] font-medium', isDarkMode ? 'text-white/60' : 'text-midnight-400')}>Listening...</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input pinned to bottom */}
          <div className="shrink-0 relative z-10">
            <ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isCentered isDarkMode={isDarkMode} startListening={startListening} />
          </div>
        </div>
      )}
    </main>
  );
}


