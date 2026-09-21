// src/App.tsx

import { useEffect, useCallback } from 'react';
import { ThreadNav } from './components/chat/ThreadNav';
import { ChatArea } from './components/chat/ChatArea';
import { useChatStore } from './store/useChatStore';
import { cn } from './lib/utils';

function App() {
  const { isDarkMode, toggleSidebar } = useChatStore();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // One-time healing after store rehydration: there must always be at least
  // one thread, and activeThreadId must point at an existing thread. Runs
  // once synchronously on mount — thread operations below keep it valid.
  useEffect(() => {
    useChatStore.getState().ensureConsistency();
    // QA-009: reconcile any assistant placeholder left incomplete by a
    // refresh during streaming, using the server's authoritative history.
    void useChatStore.getState().reconcileInterruptedStreams();
  }, []);

  // Desktop collapse state and mobile drawer state are intentionally independent.
  // We do not resize-reset the sidebar state on viewport changes, because that
  // causes flicker and unexpected toggles while the user is interacting.

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+K or Cmd+K → focus search (opens the sidebar at any width)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const isDesktop = window.innerWidth >= 1024;
      const store = useChatStore.getState();
      const alreadyOpen = isDesktop ? store.isSidebarOpen : store.isMobileSidebarOpen;
      if (!alreadyOpen) store.toggleSidebar();
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
        input?.focus();
      }, 350);
    }
    // Ctrl+N or Cmd+N → new chat (creates/reuses ONE empty thread and selects it)
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      useChatStore.getState().startNewChat();
    }
    // Ctrl+B or Cmd+B → toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    // Escape → close the sidebar (two-column layout, all widths)
    if (e.key === 'Escape') {
      const store = useChatStore.getState();
      if (store.isSidebarOpen || store.isMobileSidebarOpen) {
        useChatStore.getState().setSidebarOpen(false);
      }
    }
  }, [toggleSidebar]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={cn(
        'w-full h-full flex font-sans transition-colors duration-500 ease-out',
        isDarkMode
          ? 'bg-[#000000] text-[#ececec]'
          : 'bg-ivory-50 text-midnight-900'
      )}
    >
      <ThreadNav />
      <ChatArea />
    </div>
  );
}

export default App;
