// src/types/index.ts

export type Message = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: number;
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Backend conversation/session id (set after the first successful reply). */
  sessionId?: string;
};

export type ChatState = {
  threads: Thread[];
  activeThreadId: string | null;
  isSidebarOpen: boolean;
  editingThreadId: string | null;
  isDarkMode: boolean;
};

export type ChatActions = {
  createThread: () => Thread;
  deleteThread: (threadId: string) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  setActiveThread: (threadId: string) => void;
  addMessage: (threadId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (threadId: string, messageId: string, content: string) => void;
  setThreadSessionId: (threadId: string, sessionId: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setEditingThread: (threadId: string | null) => void;
  toggleDarkMode: () => void;
};

export type ChatStore = ChatState & ChatActions;
