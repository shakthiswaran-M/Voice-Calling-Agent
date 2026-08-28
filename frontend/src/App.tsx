// src/App.tsx

import { useEffect } from 'react';
import { ThreadNav } from './components/chat/ThreadNav';
import { ChatArea } from './components/chat/ChatArea';
import { useChatStore } from './store/useChatStore';
import { cn } from './lib/utils';

function App() {
  const { isDarkMode } = useChatStore();

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  return (
    <div className={cn(
      'flex h-screen w-full font-sans transition-colors duration-500 ease-out',
      isDarkMode
        ? 'bg-[#050816] text-white'
        : 'bg-ivory-50 text-midnight-900'
    )}>
      <ThreadNav />
      <ChatArea />
    </div>
  );
}

export default App;
