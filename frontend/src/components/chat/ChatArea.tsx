// src/components/chat/ChatArea.tsx

import { useEffect, useState, useRef, useCallback } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { MessageBubble, TtsState } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ArrowDown, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendChatMessage, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import logo from '../../assets/netkathir-logo.png';

const FALLBACK_ERROR_RESPONSE =
  "Sorry, I couldn't reach the assistant just now. Please check that the backend is running and try again.";

export function ChatArea() {
  const { threads, activeThreadId, addMessage, createThread, updateThreadTitle, setThreadSessionId, toggleSidebar, isDarkMode } = useChatStore();
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];
  const { containerRef, showScrollButton, handleScroll, scrollToBottom, scrollToBottomOnSend } = useAutoScroll([messages.length]);
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
                  <div key={msg.id}>
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
              {showScrollButton && (
                <div className="flex justify-center sticky bottom-4 z-10 animate-fade-in-up">
                  <button onClick={() => scrollToBottom(true)} className={cn('flex items-center gap-2 px-4 py-2 backdrop-blur-sm text-white rounded-full hover:shadow-lg transition-all duration-300 active:scale-95', isDarkMode ? 'bg-green-500/90 shadow-glow' : 'bg-green-600 shadow-btn')}>
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">New messages</span>
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
            <img src={logo} alt="netKathir" className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 object-contain mb-6 sm:mb-8 drop-shadow-lg message-slide-in" />
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
    </main>
  );
}
