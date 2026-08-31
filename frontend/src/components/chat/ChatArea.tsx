// src/components/chat/ChatArea.tsx

import { useEffect, useState, useRef } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ArrowDown, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sendChatMessage, transcribeAudio, synthesizeSpeech, ApiError } from '../../lib/api';
import logo from '../../assets/netkathir-logo.png';

const FALLBACK_ERROR_RESPONSE =
  "Sorry, I couldn't reach the assistant just now. Please check that the backend is running and try again.";

export function ChatArea() {
  const { threads, activeThreadId, addMessage, updateMessage, createThread, updateThreadTitle, setThreadSessionId, toggleSidebar, isDarkMode } = useChatStore();
  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages || [];
  const { containerRef, showScrollButton, handleScroll, scrollToBottom, scrollToBottomOnSend } = useAutoScroll([messages.length]);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

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

          const audioReply = await synthesizeSpeech(reply);
          const audioUrl = URL.createObjectURL(audioReply);
          const audio = new Audio(audioUrl);
          audio.play();
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
                      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center overflow-hidden', isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-white border border-midnight-100')}>
                        <img src={logo} alt="" className="w-full h-full object-contain p-0.5" />
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
          <div className="shrink-0"><ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isDarkMode={isDarkMode} onVoiceToggle={handleStartConversation} isRecording={isRecording} /></div>
        </>
      ) : (
        /* ═══ WELCOME: simple, quiet, on-brand ═══ */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
            <img src={logo} alt="netKathir" className="w-16 h-16 object-contain mb-6 message-slide-in" />
            <h1 className={cn('font-serif text-2xl md:text-3xl font-semibold text-center mb-2 message-slide-in', isDarkMode ? 'text-white' : 'text-midnight-900')} style={{ animationDelay: '0.1s' }}>
              How can I help you today?
            </h1>
            <p className={cn('text-sm text-center message-slide-in', isDarkMode ? 'text-white/40' : 'text-midnight-400')} style={{ animationDelay: '0.15s' }}>
              Type a message or tap the mic to talk
            </p>
          </div>

          <div className="shrink-0">
            <ChatInput onSend={handleSendMessage} disabled={!activeThreadId || isSending} isCentered isDarkMode={isDarkMode} onVoiceToggle={handleStartConversation} isRecording={isRecording} />
          </div>
        </div>
      )}
    </main>
  );
}