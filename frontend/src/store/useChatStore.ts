// src/store/useChatStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatStore, Thread, Message } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 15);

export const formatTimestamp = (date: number) => {
  const now = Date.now();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      threads: [],
      activeThreadId: null,
      isSidebarOpen: true,
      editingThreadId: null,
      isDarkMode: false,
      scrollPositions: {},

      createThread: () => {
        const newThread: Thread = {
          id: generateId(),
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          threads: [newThread, ...state.threads],
          activeThreadId: newThread.id,
        }));
        return newThread;
      },

      deleteThread: (threadId: string) => {
        set((state) => {
          const newThreads = state.threads.filter((t) => t.id !== threadId);
          const { [threadId]: _removed, ...restPositions } = state.scrollPositions;
          return {
            threads: newThreads,
            scrollPositions: restPositions,
            activeThreadId: state.activeThreadId === threadId
              ? newThreads.length > 0 ? newThreads[0].id : null
              : state.activeThreadId,
          };
        });
      },

      updateThreadTitle: (threadId: string, title: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, title, updatedAt: Date.now() } : t
          ),
        }));
      },

      togglePinThread: (threadId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, pinned: !t.pinned } : t
          ),
        }));
      },

      setActiveThread: (threadId: string) => {
        set({ activeThreadId: threadId });
      },

      addMessage: (threadId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
        const newMessage: Message = {
          ...message,
          id: generateId(),
          timestamp: Date.now(),
        };
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? { ...t, messages: [...t.messages, newMessage], updatedAt: Date.now() }
              : t
          ),
        }));
      },

      updateMessage: (threadId: string, messageId: string, content: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? { ...t, messages: t.messages.map((m) => m.id === messageId ? { ...m, content } : m) }
              : t
          ),
        }));
      },

      setThreadSessionId: (threadId: string, sessionId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, sessionId } : t
          ),
        }));
      },

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),
      setEditingThread: (threadId: string | null) => set({ editingThreadId: threadId }),
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

      saveScrollPosition: (threadId: string, messageId: string, offset: number) => {
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            [threadId]: { lastVisibleMessageId: messageId, scrollOffset: offset },
          },
        }));
      },

      removeScrollPosition: (threadId: string) => {
        set((state) => {
          const { [threadId]: _removed, ...rest } = state.scrollPositions;
          return { scrollPositions: rest };
        });
      },
    }),
    { name: 'netkathir-chat-v2' }
  )
);
