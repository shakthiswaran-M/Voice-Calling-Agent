// src/components/chat/ChatArea.tsx

import { useEffect, useState, useRef, useCallback } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { MessageBubble, TtsState } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ArrowDown, Menu, X, Check, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendChatMessage, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import logo from '../../assets/netkathir-logo.png';

const FALLBACK_ERROR_RESPONSE =
  "Sorry, I couldn't reach the assistant just now. Please check that the backend is running and try again.";

export function ChatArea() {
  const { threads, activeThreadId, addMessage, createThread, updateThreadTitle, setThreadSessionId, toggleSidebar, isDarkMode, saveScrollPosition, scrollPositions } = useChatStore();
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];

  // ── Scroll restoration state ──
  const [restorationTarget, setRestorationTarget] = useState<{ messageId: string; offset: number } | null>(null);

  const handlePositionChange = useCallback((threadId: string, messageId: string, offset: number) => {
    saveScrollPosition(threadId, messageId, offset);
  }, [saveScrollPosition]);

  const handleRestoreComplete = useCallback(() => {
    setRestorationTarget(null);
  }, []);

  const { containerRef, showScrollButton, isScrolledUp, handleScroll, scrollToBottom, scrollToBottomOnSend } = useAutoScroll({
    threadId: activeThreadId,
    messages,
    onPositionChange: handlePositionChange,
    restorationTarget,
    onRestoreComplete: handleRestoreComplete,
  });

  // ── Share modal state ──
  const [shareThreadId, setShareThreadId] = useState<string | null>(null);
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle');

  const getShareUrl = useCallback((threadId: string) => {
    return `${window.location.origin}/share/${threadId}`;
  }, []);

  const handleShareMessage = useCallback(() => {
    if (!activeThreadId) return;
    setShareThreadId(activeThreadId);
    setCopyLinkState('idle');
  }, [activeThreadId]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareThreadId) return;
    const url = getShareUrl(shareThreadId);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyLinkState('copied');
      setTimeout(() => setCopyLinkState('idle'), 2500);
    } catch {
      /* silently fail */
    }
  }, [shareThreadId, getShareUrl]);

  const handleWhatsAppShare = useCallback(() => {
    if (!shareThreadId) return;
    const url = getShareUrl(shareThreadId);
    const thread = threads.find(t => t.id === shareThreadId);
    const text = thread ? `Check out this conversation: ${thread.title}\n${url}` : url;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, [shareThreadId, getShareUrl, threads]);

  const closeShareModal = useCallback(() => {
    setShareThreadId(null);
    setCopyLinkState('idle');
  }, []);

  // Close share modal on Escape
  useEffect(() => {
    if (!shareThreadId) return;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeShareModal();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [shareThreadId, closeShareModal]);

  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // TTS state
  const [ttsMsgId, setTtsMsgId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TtsState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // TTS handlers

  const stopTts = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setTtsMsgId(null);
    setTtsState('idle');
  }, []);

  const pauseTts = useCallback(() => {
    if (audioRef.current && ttsState === 'playing') {
      audioRef.current.pause();
      setTtsState('paused');
    }
  }, [ttsState]);

  const playTts = useCallback(async (msgId: string, text: string) => {
    if (ttsMsgId === msgId && ttsState === 'paused' && audioRef.current) {
      audioRef.current.play();
      setTtsState('playing');
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    try {
      const audioBlob = await synthesizeSpeech(text);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      setTtsMsgId(msgId);
      setTtsState('playing');
      audio.onended = () => {
        setTtsMsgId(null);
        setTtsState('idle');
        audioRef.current = null;
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      };
      audio.onerror = () => {
        setTtsMsgId(null);
        setTtsState('idle');
        audioRef.current = null;
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      };
      await audio.play();
    } catch (err) {
      console.error('TTS failed:', err);
      setTtsMsgId(null);
      setTtsState('idle');
    }
  }, [ttsMsgId, ttsState]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); }
    };
  }, []);

  // ── Thread switching: set restoration target ──
  const prevThreadIdForRestore = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevThreadIdForRestore.current;
    prevThreadIdForRestore.current = activeThreadId;

    // Skip on first render or if thread didn't change
    if (!activeThreadId || prevId === activeThreadId) return;

    // Stop any playing TTS
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setTtsMsgId(null);
      setTtsState('idle');
    }

    // Check for a saved scroll position for this thread
    const saved = scrollPositions[activeThreadId];
    if (saved) {
      setRestorationTarget({ messageId: saved.lastVisibleMessageId, offset: saved.scrollOffset });
    } else {
      // No saved position → will scroll to bottom (handled in useAutoScroll)
      setRestorationTarget(null);
    }
  }, [activeThreadId, scrollPositions]);

  // Chat handlers

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

  const handleStartConversation = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const threadId = activeThreadId || createThread().id;
        setIsSending(true);
        try {
          const transcript = await transcribeAudio(audioBlob);
          if (!transcript || !transcript.trim()) {
            addMessage(threadId, { role: 'bot', content: "Sorry, I didn't catch that." });
            return;
          }
          addMessage(threadId, { role: 'user', content: transcript });
          const thread = useChatStore.getState().threads.find((t) => t.id === threadId);
          const { reply, session_id } = await sendChatMessage(transcript, thread?.sessionId);
          if (!thread?.sessionId) setThreadSessionId(threadId, session_id);
          addMessage(threadId, { role: 'bot', content: reply || '(no response)' });
          playTts(threadId, reply || '(no response)');
        } catch (err) {
          const message = err instanceof ApiError ? err.message : FALLBACK_ERROR_RESPONSE;
          addMessage(threadId, { role: 'bot', content: message });
        } finally {
          setIsSending(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or unavailable:', err);
    }
  };

  useEffect(() => {
    if (!activeThreadId && threads.length === 0) createThread();
  }, [activeThreadId, threads.length, createThread]);

  const hasMessages = messages.length > 0;

  return (
    <main className="chat-main">
      {hasMessages ? (
        <>
          <div className={cn('flex items-center gap-3 px-4 py-3 border-b shrink-0 safe-area-top', isDarkMode ? 'border-green-500/10' : 'border-green-100')}>
            <button onClick={toggleSidebar} className={cn('p-2 -ml-1 rounded-xl transition-all duration-200 active:scale-95', isDarkMode ? 'hover:bg-green-500/10' : 'hover:bg-green-50')} aria-label="Open sidebar">
              <Menu className={cn('w-5 h-5', isDarkMode ? 'text-green-300/60' : 'text-green-600')} />
            </button>
            <span className={cn('font-display text-sm font-semibold truncate', isDarkMode ? 'text-white' : 'text-midnight-900')}>{activeThread?.title}</span>
          </div>

          <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
            <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
              <div className="text-center mb-6 sm:mb-8 message-slide-in">
                <h2 className={cn('font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight', isDarkMode ? 'text-white' : 'text-midnight-900')}>{activeThread?.title}</h2>
                <div className="editorial-rule w-12 sm:w-16 mx-auto mt-3 sm:mt-4" />
              </div>
              {messages.map((msg, i) => {
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const showTimeline = !prevMsg || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000);
                const timelineDate = new Date(msg.timestamp);
                const timeStr = timelineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = timelineDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                const isSameDay = prevMsg && new Date(prevMsg.timestamp).toDateString() === timelineDate.toDateString();
                const isBotMsg = msg.role === 'bot';
                const msgTtsState: TtsState = ttsMsgId === msg.id ? ttsState : 'idle';
                return (
                  <div key={msg.id} data-msg-id={msg.id}>
                    {showTimeline && (
                      <div className="flex items-center gap-3 my-4 animate-fade-in">
                        <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-gray-200/60')} />
                        <span className={cn('text-[10px] font-medium whitespace-nowrap px-2 py-0.5 rounded-full', isDarkMode ? 'text-white/25 bg-white/5' : 'text-gray-400 bg-gray-100')}>
                          {isSameDay ? timeStr : dateStr + ' \u00b7 ' + timeStr}
                        </span>
                        <div className={cn('flex-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-gray-200/60')} />
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      index={i}
                      isDarkMode={isDarkMode}
                      ttsState={msgTtsState}
                      onTtsPlay={isBotMsg ? () => playTts(msg.id, msg.content) : undefined}
                      onTtsPause={isBotMsg && msgTtsState === 'playing' ? pauseTts : undefined}
                      onTtsStop={isBotMsg && msgTtsState !== 'idle' ? stopTts : undefined}
                      onShare={isBotMsg ? handleShareMessage : undefined}
                    />
                  </div>
                );
              })}
              {isSending && (
                <div className="w-full msg-slide-left">
                  <div className="max-w-[85%] md:max-w-[72%]">
                    <div className={cn('flex items-center gap-2 mb-2')}>
                      <div className={cn('w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center overflow-hidden', isDarkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200')}>
                        <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
                      </div>
                      <span className={cn('text-[10px] font-semibold tracking-wider uppercase', isDarkMode ? 'text-green-400/70' : 'text-green-600')}>netKathir</span>
                    </div>
                    <div className={cn('rounded-2xl rounded-tl-md px-5 py-4 flex items-center gap-2', isDarkMode ? 'bg-green-500/5 border border-green-500/10' : 'bg-white border border-green-100 shadow-card')}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              {isScrolledUp && (
                <div className="flex justify-center sticky bottom-4 z-10 animate-fade-in-up">
                  <button onClick={() => { setRestorationTarget(null); scrollToBottom(true); }} className={cn('flex items-center gap-2 px-4 py-2 backdrop-blur-sm text-white rounded-full shadow-lg transition-all duration-300 active:scale-95 hover:shadow-xl', isDarkMode ? 'bg-green-500/90 shadow-[0_4px_20px_rgba(34,197,94,0.3)]' : 'bg-green-600 shadow-[0_4px_20px_rgba(22,163,74,0.25)]')}>
                    <ArrowDown className="w-3.5 h-3.5" />
                    {showScrollButton && (
                      <span className="text-[11px] font-medium">New messages</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 safe-area-bottom">
            <ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isDarkMode={isDarkMode} onVoiceToggle={handleStartConversation} isRecording={isRecording} />
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          <button
            onClick={toggleSidebar}
            className={cn(
              'lg:hidden fixed top-4 left-4 z-50',
              'w-11 h-11 flex items-center justify-center rounded-xl',
              'shadow-lg transition-all duration-300 active:scale-95',
              isDarkMode
                ? 'bg-[#0A1628]/95 border border-white/10 text-white/70 hover:bg-white/10'
                : 'bg-white/95 border border-green-200 text-green-600 hover:bg-green-50 shadow-float'
            )}
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 safe-area-top">
            <img src={logo} alt="netKathir" className="w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 object-contain mb-6 sm:mb-8 drop-shadow-lg message-slide-in" />
            <h1 className={cn('font-display text-xl sm:text-2xl md:text-3xl font-bold text-center mb-2 message-slide-in', isDarkMode ? 'text-white' : 'text-midnight-900')} style={{ animationDelay: '0.1s' }}>
              How can I help you today?
            </h1>
            <p className={cn('text-xs sm:text-sm text-center message-slide-in', isDarkMode ? 'text-green-200/40' : 'text-green-700/50')} style={{ animationDelay: '0.15s' }}>
              Type a message or tap the mic to talk
            </p>
          </div>
          <div className="shrink-0 safe-area-bottom">
            <ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isCentered isDarkMode={isDarkMode} onVoiceToggle={handleStartConversation} isRecording={isRecording} />
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareThreadId && (() => {
        const thread = threads.find(t => t.id === shareThreadId);
        if (!thread) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={closeShareModal}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
            <div
              className={cn('relative w-full max-w-[380px] rounded-2xl border shadow-2xl animate-scale-in overflow-hidden', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className={cn('text-sm font-semibold', isDarkMode ? 'text-white' : 'text-gray-900')}>Share conversation</h3>
                <button onClick={closeShareModal} className={cn('p-1 rounded-lg transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-100 text-gray-400')}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className={cn('text-[11px] px-5 pb-3', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Share this conversation with others</p>

              {/* Thread preview */}
              <div className="mx-5 mb-4">
                <div className={cn('px-4 py-3 rounded-xl border text-[12px] font-medium', isDarkMode ? 'bg-white/[0.03] border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-600')}>
                  {thread.title}
                </div>
              </div>

              {/* Share actions */}
              <div className="px-5 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* WhatsApp */}
                  <button
                    onClick={handleWhatsAppShare}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold text-white bg-[#25D366] hover:bg-[#20BD5C] transition-all duration-200 active:scale-[0.97] hover:shadow-lg hover:shadow-[#25D366]/20"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </button>

                  {/* Copy Link */}
                  <button
                    onClick={handleCopyShareLink}
                    className={cn(
                      'flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.97]',
                      copyLinkState === 'copied'
                        ? 'bg-green-500 text-white'
                        : (isDarkMode ? 'bg-white/10 text-white hover:bg-white/15 border border-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')
                    )}
                  >
                    {copyLinkState === 'copied' ? (
                      <><Check className="w-4 h-4" /> Link copied</>
                    ) : (
                      <><Share2 className="w-4 h-4" /> Copy link</>
                    )}
                  </button>
                </div>
              </div>

              {/* Cancel */}
              <div className="px-5 pb-5 pt-2">
                <button onClick={closeShareModal} className={cn('w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]', isDarkMode ? 'text-white/40 hover:text-white/60 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
