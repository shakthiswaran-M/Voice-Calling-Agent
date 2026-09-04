// src/store/useChatStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatStore, Thread, Message } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 15);

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

      markThreadRead: (threadId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, unreadCount: 0 } : t
          ),
        }));
      },

      incrementUnread: (threadId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, unreadCount: (t.unreadCount || 0) + 1 } : t
          ),
        }));
      },

      togglePinMessage: (threadId: string, messageId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? { ...t, messages: t.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, pinned: !m.pinned, pinnedAt: m.pinned ? m.pinnedAt : Date.now() }
                    : m
                ) }
              : t
          ),
        }));
      },

      setReplyTo: (threadId: string, messageId: string | null) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, replyTo: messageId } : t
          ),
        }));
      },
    }),
    { name: 'netkathir-chat-v2' }
  )
);
