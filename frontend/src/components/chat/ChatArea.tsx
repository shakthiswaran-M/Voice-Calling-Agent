// src/components/chat/ChatArea.tsx

import { useEffect, useState, useRef, useCallback } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { MessageBubble, TtsState } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { MessageSearch } from './MessageSearch';
import { ContextMenu, Copy, Reply, Pin, Forward } from './ContextMenu';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ArrowDown, Menu, Search, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, TIMELINE_GAP_MS } from '../../lib/utils';
import { sendChatMessage, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import { ShareModal } from './ShareModal';
import logo from '../../assets/netkathir-logo.png';
import type { Message } from '../../types';

const FALLBACK_ERROR_RESPONSE =
  "Sorry, I couldn't reach the assistant just now. Please check that the backend is running and try again.";

export function ChatArea() {
  const {
    threads, activeThreadId, addMessage, createThread, updateThreadTitle,
    setThreadSessionId, toggleSidebar, isDarkMode, saveScrollPosition,
    scrollPositions, markThreadRead, incrementUnread, togglePinMessage,
    setReplyTo, 
  } = useChatStore();
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];

  // ── Scroll restoration ──
  const [restorationTarget, setRestorationTarget] = useState<{ messageId: string; offset: number } | null>(null);
  const handlePositionChange = useCallback((threadId: string, messageId: string, offset: number) => {
    saveScrollPosition(threadId, messageId, offset);
  }, [saveScrollPosition]);
  const handleRestoreComplete = useCallback(() => { setRestorationTarget(null); }, []);

  const { containerRef, showScrollButton, isScrolledUp, handleScroll, scrollToBottom, scrollToBottomOnSend } = useAutoScroll({
    threadId: activeThreadId, messages,
    onPositionChange: handlePositionChange,
    restorationTarget, onRestoreComplete: handleRestoreComplete,
  });

  // ── Search ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [pinnedListOpen, setPinnedListOpen] = useState(false);

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);

  // ── Reply ──
  const replyToMessage = activeThread?.replyTo
    ? messages.find(m => m.id === activeThread.replyTo)
    : null;

  // ── Share modal ──
  const [shareThreadId, setShareThreadId] = useState<string | null>(null);

  const handleShareMessage = useCallback(() => {
    if (!activeThreadId) return;
    setShareThreadId(activeThreadId);
  }, [activeThreadId]);

  // ── TTS ──
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [ttsMsgId, setTtsMsgId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TtsState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stopTts = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setTtsMsgId(null); setTtsState('idle');
  }, []);

  const pauseTts = useCallback(() => {
    if (audioRef.current && ttsState === 'playing') { audioRef.current.pause(); setTtsState('paused'); }
  }, [ttsState]);

  const playTts = useCallback(async (msgId: string, text: string) => {
    if (ttsMsgId === msgId && ttsState === 'paused' && audioRef.current) {
      audioRef.current.play(); setTtsState('playing'); return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    try {
      const audioBlob = await synthesizeSpeech(text);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio; audioUrlRef.current = url;
      setTtsMsgId(msgId); setTtsState('playing');
      audio.onended = () => { setTtsMsgId(null); setTtsState('idle'); audioRef.current = null; URL.revokeObjectURL(url); audioUrlRef.current = null; };
      audio.onerror = () => { setTtsMsgId(null); setTtsState('idle'); audioRef.current = null; URL.revokeObjectURL(url); audioUrlRef.current = null; };
      await audio.play();
    } catch (err) { console.error('TTS failed:', err); setTtsMsgId(null); setTtsState('idle'); }
  }, [ttsMsgId, ttsState]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); }
    };
  }, []);

  // ── Thread switching ──
  const prevThreadIdForRestore = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevThreadIdForRestore.current;
    prevThreadIdForRestore.current = activeThreadId;
    if (!activeThreadId || prevId === activeThreadId) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setTtsMsgId(null); setTtsState('idle'); }
    setSearchOpen(false); setSelectedMsgId(null);
    const saved = scrollPositions[activeThreadId];
    if (saved) {
      setRestorationTarget({ messageId: saved.lastVisibleMessageId, offset: saved.scrollOffset });
    } else {
      setRestorationTarget(null);
    }
    // Mark thread as read
    if (activeThreadId) markThreadRead(activeThreadId);
  }, [activeThreadId, scrollPositions, markThreadRead]);

  // ── Track unread for other threads ──
  const prevMsgCountRef = useRef<Record<string, number>>({});
  useEffect(() => {
    threads.forEach(t => {
      if (!t.id) return;
      const prev = prevMsgCountRef.current[t.id] || 0;
      const curr = t.messages.length;
      if (curr > prev && t.id !== activeThreadId && prev > 0) {
        incrementUnread(t.id);
      }
      prevMsgCountRef.current[t.id] = curr;
    });
  }, [threads, activeThreadId, incrementUnread]);

  // ── Chat handlers ──
  const handleSendMessage = async (content: string) => {
    const threadId = activeThreadId || createThread().id;
    const thread = useChatStore.getState().threads.find((t) => t.id === threadId);
    if (thread && thread.messages.length === 0) {
      const title = content.length > 40 ? content.substring(0, 40) + '...' : content;
      updateThreadTitle(threadId, title);
    }
    // If replying to a message, prepend reference
    let sendContent = content;
    const replyMsg = thread?.replyTo ? thread.messages.find(m => m.id === thread.replyTo) : null;
    if (replyMsg) {
      sendContent = 'Replying to: "' + replyMsg.content.substring(0, 100) + '"\n\n' + content;
    }
    addMessage(threadId, { role: 'user', content: sendContent });
    scrollToBottomOnSend();
    setReplyTo(threadId, null);
    setIsSending(true);
    try {
      const { reply, session_id } = await sendChatMessage(content, thread?.sessionId);
      if (!thread?.sessionId) setThreadSessionId(threadId, session_id);
      addMessage(threadId, { role: 'bot', content: reply || "(no response)" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : FALLBACK_ERROR_RESPONSE;
      addMessage(threadId, { role: 'bot', content: message });
    } finally { setIsSending(false); }
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
            addMessage(threadId, { role: 'bot', content: "Sorry, I didn't catch that." }); return;
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
        } finally { setIsSending(false); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(); setIsRecording(true);
    } catch (err) { console.error('Microphone access denied or unavailable:', err); }
  };

  useEffect(() => {
    if (!activeThreadId && threads.length === 0) createThread();
  }, [activeThreadId, threads.length, createThread]);

  // ── Context menu handler ──
  const handleContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  }, []);

  const contextMenuItems = contextMenu ? [
    {
      label: 'Copy',
      icon: <Copy className="w-3.5 h-3.5" />,
      onClick: () => { navigator.clipboard.writeText(contextMenu.message.content); },
    },
    {
      label: 'Reply',
      icon: <Reply className="w-3.5 h-3.5" />,
      onClick: () => { if (activeThreadId) setReplyTo(activeThreadId, contextMenu.message.id); },
    },
    {
      label: 'Pin message',
      icon: <Pin className="w-3.5 h-3.5" />,
      onClick: () => { if (activeThreadId) togglePinMessage(activeThreadId, contextMenu.message.id); },
      checked: contextMenu.message.pinned,
    },
    {
      label: 'Forward',
      icon: <Forward className="w-3.5 h-3.5" />,
      onClick: () => { handleShareMessage(); },
    },
  ] : [];

  // ── Navigate to message (search + keyboard) ──
  const navigateToMessage = useCallback((msgId: string) => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector('[data-msg-id="' + msgId + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSelectedMsgId(msgId);
      setTimeout(() => setSelectedMsgId(null), 2000);
    }
  }, [containerRef]);

  // ── Print ──
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl+F / Cmd+F — search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }

      // Ctrl+P / Cmd+P — print
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }

      // Ctrl+Shift+C / Cmd+Shift+C — copy last bot reply
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        const lastBot = [...messages].reverse().find(m => m.role === 'bot');
        if (lastBot) {
          navigator.clipboard.writeText(lastBot.content);
        }
      }

      // Arrow keys — message navigation (only when not in input)
      if (!isInput && !searchOpen) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIdx = messages.findIndex(m => m.id === selectedMsgId);
          if (currentIdx > 0) navigateToMessage(messages[currentIdx - 1].id);
          else if (currentIdx === -1 && messages.length > 0) navigateToMessage(messages[messages.length - 1].id);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const currentIdx = messages.findIndex(m => m.id === selectedMsgId);
          if (currentIdx >= 0 && currentIdx < messages.length - 1) navigateToMessage(messages[currentIdx + 1].id);
          else if (currentIdx === -1 && messages.length > 0) navigateToMessage(messages[0].id);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [messages, selectedMsgId, searchOpen, navigateToMessage, handlePrint]);

  const hasMessages = messages.length > 0;

  // Read the in-search-bar query once per render (the input lives in
  // MessageSearch's local state, so this value updates when ChatArea renders).
  const searchInput = searchOpen
    ? document.querySelector<HTMLInputElement>('input[placeholder="Search conversation..."]')?.value || ''
    : '';

  const pinnedMessages = messages.filter((m) => m.pinned);
  // Most recently pinned first (newest pinnedAt, fallback to timestamp)
  const pinnedByRecency = pinnedMessages.length > 0
    ? [...pinnedMessages].sort((a, b) => (b.pinnedAt || b.timestamp) - (a.pinnedAt || a.timestamp))
    : [];
  const latestPinned = pinnedByRecency.length > 0 ? pinnedByRecency[0] : null;

  // Close the pinned list when the thread or the set of pinned messages changes
  const pinnedIdsKey = pinnedMessages.map((m) => m.id).join(',');
  useEffect(() => { setPinnedListOpen(false); }, [activeThreadId, pinnedIdsKey]);

  // Close the pinned list on outside click / Escape
  useEffect(() => {
    if (!pinnedListOpen) return;
    const onDown = (e: MouseEvent) => {
      if (e.target && !(e.target as HTMLElement).closest('[data-pinned-panel]')) setPinnedListOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinnedListOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinnedListOpen]);

  return (
    <main className="chat-main">
      {hasMessages ? (
        <>
          {/* Print header — hidden on screen, shown in print */}
          <div className="print-header hidden">
            <h1>NETKATHIR</h1>
            <p>Conversation: {activeThread?.title}</p>
            <p>Date: {new Date().toLocaleDateString()}</p>
          </div>

          {/* Top bar */}
          <div className={cn('flex items-center gap-2 px-4 py-3 border-b shrink-0 safe-area-top', isDarkMode ? 'border-[#2f2f2f]' : 'border-green-100')}>
            <button onClick={toggleSidebar} className={cn('p-2 -ml-1 rounded-xl transition-all duration-200 active:scale-95', isDarkMode ? 'hover:bg-green-500/10' : 'hover:bg-green-50')} aria-label="Open sidebar">
              <Menu className={cn('w-5 h-5', isDarkMode ? 'text-green-300/60' : 'text-green-600')} />
            </button>
            <span className={cn('font-display text-sm font-semibold truncate flex-1', isDarkMode ? 'text-[#ececec]' : 'text-midnight-900')}>{activeThread?.title}</span>
            <button onClick={() => setSearchOpen(!searchOpen)} className={cn('p-2 rounded-xl transition-all duration-200', isDarkMode ? 'hover:bg-green-500/10 text-white/40' : 'hover:bg-green-50 text-gray-400')} aria-label="Search conversation">
              <Search className="w-4 h-4" />
            </button>
            <button onClick={handlePrint} className={cn('p-2 rounded-xl transition-all duration-200', isDarkMode ? 'hover:bg-green-500/10 text-white/40' : 'hover:bg-green-50 text-gray-400')} aria-label="Print conversation">
              <Printer className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <MessageSearch
            isOpen={searchOpen}
            onClose={() => { setSearchOpen(false); setSelectedMsgId(null); }}
            messages={messages}
            onNavigateToMessage={navigateToMessage}
            isDarkMode={isDarkMode}
          />

          {/* Pinned message banner — WhatsApp-style, always visible under the header.
              Shows the most recently pinned message; the "N pinned" button opens the
              list of all pinned messages. Disappears when the last pin is removed. */}
          {latestPinned && (
            <div data-pinned-panel className={cn('relative shrink-0 z-30', isDarkMode ? '' : '')}>
              <div className={cn('flex items-center gap-2 px-4 sm:px-6 py-1.5 border-b', isDarkMode ? 'border-[#2f2f2f] bg-[#1c1c1c]' : 'border-green-100 bg-green-50/70')}>
                <button
                  onClick={() => navigateToMessage(latestPinned.id)}
                  className="flex-1 min-w-0 flex items-baseline gap-1.5 text-left group"
                  aria-label="View pinned message"
                >
                  <Pin className={cn('w-3 h-3 shrink-0 self-center', isDarkMode ? 'text-green-400/80' : 'text-green-600')} />
                  <span className={cn('text-[11px] font-semibold uppercase tracking-wide shrink-0', isDarkMode ? 'text-green-400/80' : 'text-green-600')}>
                    {latestPinned.role === 'user' ? 'You' : 'NetKathir'}
                  </span>
                  <span className={cn('text-xs truncate', isDarkMode ? 'text-white/70 group-hover:text-white/90' : 'text-midnight-700 group-hover:text-midnight-900')}>
                    {latestPinned.content}
                  </span>
                </button>
                {pinnedMessages.length > 1 && (
                  <button
                    onClick={() => setPinnedListOpen((v) => !v)}
                    aria-expanded={pinnedListOpen}
                    aria-label={pinnedListOpen ? 'Hide pinned messages' : 'Show all pinned messages'}
                    className={cn('flex items-center gap-1 text-[10px] font-semibold shrink-0 rounded-md px-1.5 py-1 transition-colors', pinnedListOpen ? (isDarkMode ? 'text-green-400 bg-white/5' : 'text-green-600 bg-green-100/70') : (isDarkMode ? 'text-white/40 hover:text-green-400 hover:bg-white/5' : 'text-midnight-300 hover:text-green-600 hover:bg-green-100/60'))}
                  >
                    {pinnedMessages.length} pinned
                    {pinnedListOpen
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Dropdown list of all pinned messages, newest first */}
              {pinnedListOpen && pinnedByRecency.length > 1 && (
                <div className={cn('absolute top-full left-0 right-0 max-h-64 overflow-y-auto rounded-b-xl border-t-0 shadow-xl animate-fade-in', isDarkMode ? 'bg-[#232323] border border-[#424242]' : 'bg-white border border-green-100')}>
                  {pinnedByRecency.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => { setPinnedListOpen(false); navigateToMessage(pm.id); }}
                      className={cn('w-full flex items-baseline gap-2 px-4 sm:px-6 py-2.5 text-left transition-colors', isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-green-50/70')}
                    >
                      <Pin className={cn('w-3 h-3 shrink-0 self-center', pm.id === latestPinned.id ? (isDarkMode ? 'text-green-400 fill-green-400/40' : 'text-green-600 fill-green-500/30') : (isDarkMode ? 'text-white/25' : 'text-gray-300'))} />
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide shrink-0', pm.id === latestPinned.id ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-white/40' : 'text-gray-400'))}>
                        {pm.role === 'user' ? 'You' : 'NetKathir'}
                      </span>
                      <span className={cn('text-xs truncate', pm.id === latestPinned.id ? (isDarkMode ? 'text-white/85' : 'text-midnight-900') : (isDarkMode ? 'text-white/60' : 'text-midnight-600'))}>
                        {pm.content}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
            <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
              <div className="text-center mb-6 sm:mb-8 message-slide-in">
                <h2 className={cn('font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight', isDarkMode ? 'text-[#ececec]' : 'text-midnight-900')}>{activeThread?.title}</h2>
                <div className="editorial-rule w-12 sm:w-16 mx-auto mt-3 sm:mt-4" />
              </div>

              {messages.map((msg, i) => {
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const showTimeline = !prevMsg || (msg.timestamp - prevMsg.timestamp > TIMELINE_GAP_MS);
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
                      onTtsPlay={isBotMsg ? playTts : undefined}
                      onTtsPause={isBotMsg && msgTtsState === 'playing' ? pauseTts : undefined}
                      onTtsStop={isBotMsg && msgTtsState !== 'idle' ? stopTts : undefined}
                      onShare={isBotMsg ? handleShareMessage : undefined}
                      onContextMenu={handleContextMenu}
                      isSelected={selectedMsgId === msg.id}
                      searchQuery={searchInput}
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
            <ChatInput
              onSend={handleSendMessage}
              disabled={!activeThreadId || isSending}
              isDarkMode={isDarkMode}
              onVoiceToggle={handleStartConversation}
              isRecording={isRecording}
              replyToMessage={replyToMessage?.content || null}
              onClearReply={activeThreadId ? () => setReplyTo(activeThreadId, null) : undefined}
            />
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
            <h1 className={cn('font-display text-xl sm:text-2xl md:text-3xl font-bold text-center mb-2 message-slide-in', isDarkMode ? 'text-[#ececec]' : 'text-midnight-900')} style={{ animationDelay: '0.1s' }}>
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

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Share Modal */}
      {shareThreadId && (
        <ShareModal
          threadId={shareThreadId}
          threadTitle={threads.find((t) => t.id === shareThreadId)?.title || ''}
          isDarkMode={isDarkMode}
          onClose={() => setShareThreadId(null)}
        />
      )}
    </main>
  );
}
