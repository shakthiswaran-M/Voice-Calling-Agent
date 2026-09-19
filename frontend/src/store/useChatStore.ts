// src/store/useChatStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatStore, Thread, Message } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 15);

// Single factory for empty threads — used by New Chat and the last-thread
// delete fallback so both produce the exact same shape (no fake messages).
const makeEmptyThread = (): Thread => ({
  id: generateId(),
  title: 'New Chat',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      threads: [] as Thread[],
      activeThreadId: null,
      isSidebarOpen: true,
      isMobileSidebarOpen: false,
      editingThreadId: null,
      isDarkMode: false,
      isCreatingThread: false,
      scrollPositions: {} as Record<string, { lastVisibleMessageId: string; scrollOffset: number }>,

      createThread: (): Thread => {
        const newThread = makeEmptyThread();
        set((state: ChatStore) => ({
          threads: [newThread, ...state.threads],
          activeThreadId: newThread.id,
        }));
        return newThread;
      },

      deleteThread: (threadId: string) => {
        set((state) => {
          const remaining = state.threads.filter((t) => t.id !== threadId);
          const { [threadId]: _removed, ...restPositions } = state.scrollPositions;

          // NEVER allow zero threads: deleting the last thread creates exactly
          // ONE empty fallback thread, selected immediately (idempotent — this
          // is a single synchronous store update, so no effect/refresh can
          // double-fire it).
          if (remaining.length === 0) {
            const fallback = makeEmptyThread();
            return {
              threads: [fallback],
              scrollPositions: restPositions,
              activeThreadId: fallback.id,
            };
          }

          // Keep the active thread if it survived; otherwise select the most
          // recently updated remaining thread. activeThreadId must never point
          // at a deleted/non-existent thread.
          const activeStillExists = remaining.some((t) => t.id === state.activeThreadId);
          const nextActiveId = activeStillExists
            ? state.activeThreadId
            : [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;

          return {
            threads: remaining,
            scrollPositions: restPositions,
            activeThreadId: nextActiveId,
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

      setActiveThread: (threadId: string | null) => {
        set({ activeThreadId: threadId });
      },

      startNewChat: (): Thread => {
        const state = get();
        // Idempotent New Chat: if a valid empty "New Chat" thread already
        // exists, reuse it instead of creating another one (protects against
        // rapid clicks / repeated shortcuts producing duplicate empties).
        const emptyThread = state.threads.find(
          (t) => t.messages.length === 0 && t.title === 'New Chat'
        );
        if (emptyThread) {
          set({ activeThreadId: emptyThread.id });
          return emptyThread;
        }
        return get().createThread();
      },

      // One-time session healing after store rehydration: guarantees the
      // invariant "at least one thread exists" and "activeThreadId is valid".
      ensureConsistency: () => {
        const state = get();

        if (state.threads.length === 0) {
          const fallback = makeEmptyThread();
          set({ threads: [fallback], activeThreadId: fallback.id });
          return;
        }

        const activeExists = state.threads.some((t) => t.id === state.activeThreadId);
        if (!activeExists) {
          const mostRecent = [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          set({ activeThreadId: mostRecent.id });
        }
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
        return newMessage.id;
      },

      updateMessage: (threadId: string, messageId: string, content: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) => m.id === messageId ? { ...m, content } : m),
                  updatedAt: Date.now(),
                }
              : t
          ),
        }));
      },

      removeMessage: (threadId: string, messageId: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.filter((message) => message.id !== messageId),
                  updatedAt: Date.now(),
                }
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

      toggleSidebar: () => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
          set((state) => ({ isSidebarOpen: !state.isSidebarOpen, isMobileSidebarOpen: false }));
          return;
        }

        set((state) => ({
          isMobileSidebarOpen: !state.isMobileSidebarOpen,
          isSidebarOpen: state.isMobileSidebarOpen ? false : true,
        }));
      },
      setSidebarOpen: (open: boolean) => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
          set({ isSidebarOpen: open, isMobileSidebarOpen: false });
          return;
        }

        set({ isMobileSidebarOpen: open, isSidebarOpen: open });
      },
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
