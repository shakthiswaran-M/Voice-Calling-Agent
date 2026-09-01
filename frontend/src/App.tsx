// src/App.tsx

import { useEffect, useCallback } from 'react';
import { ThreadNav } from './components/chat/ThreadNav';
import { ChatArea } from './components/chat/ChatArea';
import { useChatStore } from './store/useChatStore';
import { cn } from './lib/utils';

function App() {
  const { isDarkMode, toggleSidebar, createThread } = useChatStore();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+K or Cmd+K → focus search (opens sidebar)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const store = useChatStore.getState();
      if (!store.isSidebarOpen) store.toggleSidebar();
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder="Search..."]');
        input?.focus();
      }, 350);
    }
    // Ctrl+N or Cmd+N → new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createThread();
    }
    // Ctrl+B or Cmd+B → toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    // Escape → close sidebar on mobile
    if (e.key === 'Escape') {
      const store = useChatStore.getState();
      if (store.isSidebarOpen && window.innerWidth < 1024) {
        store.toggleSidebar();
      }
    }
  }, [toggleSidebar, createThread]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={cn(
        'w-full h-full flex font-sans transition-colors duration-500 ease-out',
        isDarkMode
          ? 'bg-[#050F0A] text-green-50'
          : 'bg-ivory-50 text-midnight-900'
      )}
    >
      <ThreadNav />
      <ChatArea />
    </div>
  );
}

export default App;
