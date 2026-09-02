// src/types/index.ts

export type Message = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: number;
  pinned?: boolean;
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Backend conversation/session id (set after the first successful reply). */
  sessionId?: string;
  /** Whether this thread is pinned to the top of the list. */
  pinned?: boolean;
  /** Number of unread messages. */
  unreadCount?: number;
  /** Message ID this thread is replying to. */
  replyTo?: string | null;
};

export type ScrollPosition = {
  lastVisibleMessageId: string;
  scrollOffset: number;
};

export type ChatState = {
  threads: Thread[];
  activeThreadId: string | null;
  isSidebarOpen: boolean;
  editingThreadId: string | null;
  isDarkMode: boolean;
  scrollPositions: Record<string, ScrollPosition>;
};

export type ChatActions = {
  createThread: () => Thread;
  deleteThread: (threadId: string) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  togglePinThread: (threadId: string) => void;
  setActiveThread: (threadId: string) => void;
  addMessage: (threadId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (threadId: string, messageId: string, content: string) => void;
  setThreadSessionId: (threadId: string, sessionId: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setEditingThread: (threadId: string | null) => void;
  toggleDarkMode: () => void;
  saveScrollPosition: (threadId: string, messageId: string, offset: number) => void;
  removeScrollPosition: (threadId: string) => void;
  markThreadRead: (threadId: string) => void;
  incrementUnread: (threadId: string) => void;
  togglePinMessage: (threadId: string, messageId: string) => void;
  setReplyTo: (threadId: string, messageId: string | null) => void;
};

export type ChatStore = ChatState & ChatActions;
