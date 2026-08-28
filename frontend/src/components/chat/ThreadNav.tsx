// src/components/chat/ThreadNav.tsx

import { useState, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { formatTimestamp } from '../../store/useChatStore';
import type { Thread } from '../../types';
import { Plus, Trash2, Edit2, Check, X, Moon, Sun, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ThreadNav() {
  const {
    threads, activeThreadId, editingThreadId, isDarkMode, isSidebarOpen,
    createThread, deleteThread, updateThreadTitle, setActiveThread,
    setEditingThread, toggleDarkMode, toggleSidebar,
  } = useChatStore();

  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDeleteThread = (e: MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this thread?')) deleteThread(threadId);
  };

  const handleEditClick = (e: MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setEditTitle(thread.title);
    setEditingThread(thread.id);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSaveTitle = (threadId: string) => {
    if (editTitle.trim()) updateThreadTitle(threadId, editTitle.trim());
    setEditingThread(null);
    setEditTitle('');
  };

  const handleKeyDown = (e: KeyboardEvent, threadId: string) => {
    if (e.key === 'Enter') handleSaveTitle(threadId);
    else if (e.key === 'Escape') setEditingThread(null);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className={cn(
            'fixed inset-0 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300',
            isDarkMode ? 'bg-black/50' : 'bg-black/20'
          )}
          onClick={toggleSidebar}
        />
      )}

      {/* Collapsed Toggle Button */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className={cn(
            'hidden lg:flex fixed left-4 top-20 z-50 items-center gap-2 px-3 py-2 rounded-xl shadow-lg transition-all duration-300',
            isDarkMode
              ? 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              : 'bg-white border border-midnight-200 shadow-xl hover:bg-ivory-100'
          )}
          aria-label="Open sidebar"
        >
          <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white' : 'text-midnight-900')} />
        </button>
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:relative z-50 h-full flex flex-col transition-all duration-500 ease-out backdrop-blur-md',
        isDarkMode
          ? 'bg-[#0a0e27]/95 border-white/5'
          : 'bg-white/80 border-midnight-200/50',
        'w-64 border-r',
        isSidebarOpen
          ? 'translate-x-0'
          : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0'
      )}>
        {/* Close Button */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'absolute right-3 top-4 lg:-right-3 lg:top-6 z-10 w-7 h-7 flex items-center justify-center rounded-full shadow-lg transition-all duration-300',
            isDarkMode
              ? 'bg-[#0a0e27] border border-white/10 hover:bg-white/10'
              : 'bg-white border border-midnight-200/50 hover:bg-ivory-100'
          )}
          aria-label="Close sidebar"
        >
          <ChevronLeft className={cn('w-3.5 h-3.5', isDarkMode ? 'text-white/50' : 'text-midnight-400')} />
        </button>

        {/* Header — Brand + New Chat */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="sidebar-orb-wrapper" style={{ width: 36, height: 36 }}>
              <div className="sidebar-orb-aurora" />
              <div className="sidebar-orb-core">
                <div className="sidebar-orb-plasma" />
                <div className="sidebar-orb-spin" />
                <div className="sidebar-orb-shine" />
                <div className="sidebar-orb-highlight" />
              </div>
            </div>
            <div>
              <h1 className={cn('font-serif text-base font-semibold tracking-tight leading-none', isDarkMode ? 'text-white' : 'text-midnight-900')}>
                netKathir
              </h1>
              <p className={cn('text-[9px] tracking-[0.2em] uppercase font-medium', isDarkMode ? 'text-cyan-400/60' : 'text-cyan-600/60')}>
                Bot
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => createThread()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-cyan-500 text-[#050816] rounded-xl text-xs font-semibold tracking-wide hover:bg-cyan-400 transition-all duration-300 active:scale-[0.97]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              New Chat
            </button>
            <button
              onClick={toggleDarkMode}
              className={cn(
                'p-2.5 rounded-xl border transition-all duration-300',
                isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-midnight-200/50 hover:bg-ivory-100'
              )}
              aria-label="Toggle dark mode"
            >
              {isDarkMode
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-midnight-400" />
              }
            </button>
          </div>
        </div>

        <div className={cn('mx-5 h-px', isDarkMode ? 'bg-gradient-to-r from-transparent via-white/10 to-transparent' : 'bg-gradient-to-r from-transparent via-midnight-200/40 to-transparent')} />

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {threads.length === 0 ? (
            <div className="text-center py-10">
              <MessageCircle className={cn('w-8 h-8 mx-auto mb-3', isDarkMode ? 'text-white/15' : 'text-midnight-200')} />
              <p className={cn('text-xs font-medium', isDarkMode ? 'text-white/40' : 'text-midnight-400')}>No conversations yet</p>
              <p className={cn('text-[10px] mt-1', isDarkMode ? 'text-white/20' : 'text-midnight-300')}>Start one with the button above</p>
            </div>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={cn(
                  'group relative flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-300',
                  activeThreadId === thread.id
                    ? isDarkMode
                      ? 'bg-cyan-500/10 text-white border border-cyan-500/20'
                      : 'bg-cyan-500/10 text-midnight-900 border border-cyan-500/20'
                    : isDarkMode
                      ? 'text-white/50 hover:bg-white/5 hover:text-white/70'
                      : 'text-midnight-600 hover:bg-ivory-100 hover:text-midnight-800'
                )}
              >
                {activeThreadId === thread.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-cyan-400 to-purple-500 rounded-r-full" />
                )}

                {editingThreadId === thread.id ? (
                  <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveTitle(thread.id)}
                      onKeyDown={(e) => handleKeyDown(e, thread.id)}
                      className={cn(
                        'flex-1 min-w-0 px-2 py-1 text-xs bg-transparent border-b border-cyan-400/30 focus:outline-none focus:border-cyan-500 transition-colors',
                        isDarkMode ? 'text-white' : 'text-midnight-900'
                      )}
                    />
                    <button onClick={() => handleSaveTitle(thread.id)} className="p-1 rounded-md hover:bg-white/10 transition-colors">
                      <Check className={cn('w-3 h-3', isDarkMode ? 'text-cyan-400' : 'text-cyan-600')} />
                    </button>
                    <button onClick={() => setEditingThread(null)} className="p-1 rounded-md hover:bg-white/10 transition-colors">
                      <X className={cn('w-3 h-3', isDarkMode ? 'text-white/40' : 'text-midnight-300')} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <h3 className={cn(
                        'text-xs font-medium truncate',
                        activeThreadId === thread.id
                          ? isDarkMode ? 'text-white' : 'text-midnight-900'
                          : isDarkMode ? 'text-white/60' : 'text-midnight-700'
                      )}>
                        {thread.title}
                      </h3>
                      <p className={cn(
                        'text-[10px] mt-0.5 tabular-nums',
                        activeThreadId === thread.id
                          ? isDarkMode ? 'text-cyan-400/40' : 'text-cyan-600/40'
                          : isDarkMode ? 'text-white/25' : 'text-midnight-300'
                      )}>
                        {formatTimestamp(thread.updatedAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={(e) => handleEditClick(e, thread)}
                        className="p-1 rounded-md hover:bg-white/10 transition-colors"
                        aria-label="Edit thread"
                      >
                        <Edit2 className={cn('w-3 h-3', isDarkMode ? 'text-white/40' : 'text-midnight-300')} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteThread(e, thread.id)}
                        className="p-1 rounded-md hover:bg-red-500/10 text-red-400/50 hover:text-red-400 transition-colors"
                        aria-label="Delete thread"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={cn('p-4 border-t', isDarkMode ? 'border-white/5' : 'border-midnight-100/50')}>
          <p className={cn('text-[9px] text-center tracking-wider uppercase', isDarkMode ? 'text-white/15' : 'text-midnight-300')}>
            Crafted with React + TypeScript
          </p>
        </div>
      </aside>
    </>
  );
}
