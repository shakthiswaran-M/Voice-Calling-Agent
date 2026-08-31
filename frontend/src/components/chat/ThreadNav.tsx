import { useState, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { formatTimestamp } from '../../store/useChatStore';
import type { Thread } from '../../types';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Moon,
  Sun,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

export function ThreadNav() {
  const {
    threads,
    activeThreadId,
    editingThreadId,
    isDarkMode,
    isSidebarOpen,
    createThread,
    deleteThread,
    updateThreadTitle,
    setActiveThread,
    setEditingThread,
    toggleDarkMode,
    toggleSidebar,
  } = useChatStore();

  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDeleteThread = (
    e: MouseEvent,
    threadId: string
  ) => {
    e.stopPropagation();

    if (window.confirm('Delete this conversation?')) {
      deleteThread(threadId);
    }
  };

  const handleEditClick = (
    e: MouseEvent,
    thread: Thread
  ) => {
    e.stopPropagation();

    setEditTitle(thread.title);
    setEditingThread(thread.id);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSaveTitle = (threadId: string) => {
    if (editTitle.trim()) {
      updateThreadTitle(threadId, editTitle.trim());
    }

    setEditingThread(null);
    setEditTitle('');
  };

  const handleKeyDown = (
    e: KeyboardEvent,
    threadId: string
  ) => {
    if (e.key === 'Enter') {
      handleSaveTitle(threadId);
    } else if (e.key === 'Escape') {
      setEditingThread(null);
      setEditTitle('');
    }
  };

  const handleThreadSelect = (threadId: string) => {
    setActiveThread(threadId);

    if (window.innerWidth < 1024 && isSidebarOpen) {
      toggleSidebar();
    }
  };

  const handleNewChat = () => {
    createThread();

    if (window.innerWidth < 1024 && isSidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className={cn(
            'fixed inset-0 z-40 lg:hidden transition-opacity duration-300',
            isDarkMode
              ? 'bg-black/60 backdrop-blur-sm'
              : 'bg-black/25 backdrop-blur-sm'
          )}
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Desktop Open Sidebar Button */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className={cn(
            'hidden lg:flex fixed left-4 top-20 z-50',
            'items-center justify-center',
            'w-10 h-10 rounded-xl',
            'shadow-lg transition-all duration-300',
            isDarkMode
              ? 'bg-[#0A1628] border border-white/10 text-white hover:bg-white/10'
              : 'bg-white border border-midnight-200 shadow-xl hover:bg-ivory-100'
          )}
          aria-label="Open sidebar"
        >
          <ChevronRight
            className={cn(
              'w-4 h-4',
              isDarkMode ? 'text-white' : 'text-midnight-900'
            )}
          />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:relative z-50 h-full',
          'flex flex-col',
          'transition-all duration-300 ease-out',
          'backdrop-blur-md',
          'border-r',
          isDarkMode
            ? 'bg-[#0A1628]/98 border-white/5'
            : 'bg-white/95 border-midnight-200/50',
          'w-[85vw] max-w-[360px]',
          'lg:w-64',
          isSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0'
        )}
      >
        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <img
                src={logo}
                alt="netKathir"
                className="w-10 h-10 object-contain"
              />

              <div>
                <h1
                  className={cn(
                    'font-serif text-base font-semibold tracking-tight leading-none',
                    isDarkMode
                      ? 'text-white'
                      : 'text-midnight-900'
                  )}
                >
                  netKathir
                </h1>

                <p className="text-[9px] tracking-[0.2em] uppercase font-medium mt-1 text-[#4CAF50]">
                  AI Assistant
                </p>
              </div>
            </div>

            {/* Mobile Close */}
            <button
              onClick={toggleSidebar}
              className={cn(
                'lg:hidden flex items-center justify-center',
                'w-9 h-9 rounded-xl',
                'transition-colors',
                isDarkMode
                  ? 'hover:bg-white/10 text-white/60'
                  : 'hover:bg-ivory-100 text-midnight-400'
              )}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* New Chat + Theme */}
          <div className="flex gap-2 mt-5">
            <button
              onClick={handleNewChat}
              className={cn(
                'flex-1 flex items-center justify-center gap-2',
                'px-3 py-3 rounded-xl',
                'text-xs font-semibold tracking-wide',
                'transition-all duration-200',
                'active:scale-[0.97]',
                'bg-[#4CAF50] text-white',
                'hover:bg-[#43A047]',
                'shadow-[0_4px_14px_rgba(76,175,80,0.18)]'
              )}
            >
              <Plus
                className="w-4 h-4"
                strokeWidth={2.5}
              />
              New Chat
            </button>

            <button
              onClick={toggleDarkMode}
              className={cn(
                'w-11 h-11 flex items-center justify-center',
                'rounded-xl border',
                'transition-all duration-200',
                isDarkMode
                  ? 'border-white/10 hover:bg-white/5'
                  : 'border-midnight-200/50 hover:bg-ivory-100'
              )}
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-midnight-400" />
              )}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div
          className={cn(
            'mx-5 h-px',
            isDarkMode
              ? 'bg-white/10'
              : 'bg-midnight-200/40'
          )}
        />

        {/* Conversation Heading */}
        <div className="px-5 pt-5 pb-2">
          <p
            className={cn(
              'text-[10px] font-semibold tracking-[0.15em] uppercase',
              isDarkMode
                ? 'text-white/30'
                : 'text-midnight-400'
            )}
          >
            Conversations
          </p>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {threads.length === 0 ? (
            <div className="text-center py-12 px-5">
              <div
                className={cn(
                  'w-12 h-12 mx-auto mb-4 rounded-2xl',
                  'flex items-center justify-center',
                  isDarkMode
                    ? 'bg-white/5'
                    : 'bg-ivory-100'
                )}
              >
                <MessageCircle
                  className={cn(
                    'w-6 h-6',
                    isDarkMode
                      ? 'text-white/20'
                      : 'text-midnight-200'
                  )}
                />
              </div>

              <p
                className={cn(
                  'text-xs font-medium',
                  isDarkMode
                    ? 'text-white/50'
                    : 'text-midnight-500'
                )}
              >
                No conversations yet
              </p>

              <p
                className={cn(
                  'text-[10px] mt-1.5 leading-relaxed',
                  isDarkMode
                    ? 'text-white/25'
                    : 'text-midnight-300'
                )}
              >
                Start a new conversation using the button above.
              </p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive =
                activeThreadId === thread.id;

              return (
                <div
                  key={thread.id}
                  onClick={() =>
                    handleThreadSelect(thread.id)
                  }
                  className={cn(
                    'group relative flex items-center gap-3',
                    'px-3 py-3.5 rounded-xl',
                    'cursor-pointer',
                    'transition-all duration-200',
                    'min-h-[58px]',
                    isActive
                      ? isDarkMode
                        ? 'bg-[#4CAF50]/10 text-white border border-[#4CAF50]/20'
                        : 'bg-[#4CAF50]/10 text-midnight-900 border border-[#4CAF50]/20'
                      : isDarkMode
                        ? 'text-white/50 hover:bg-white/5 hover:text-white/80'
                        : 'text-midnight-600 hover:bg-ivory-100 hover:text-midnight-800'
                  )}
                >
                  {/* Active Indicator */}
                  {isActive && (
                    <div
                      className={cn(
                        'absolute left-0 top-1/2',
                        '-translate-y-1/2',
                        'w-[3px] h-6',
                        'bg-[#4CAF50]',
                        'rounded-r-full'
                      )}
                    />
                  )}

                  {editingThreadId === thread.id ? (
                    <div
                      className="flex items-center gap-1.5 w-full"
                      onClick={(e) =>
                        e.stopPropagation()
                      }
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) =>
                          setEditTitle(e.target.value)
                        }
                        onBlur={() =>
                          handleSaveTitle(thread.id)
                        }
                        onKeyDown={(e) =>
                          handleKeyDown(
                            e,
                            thread.id
                          )
                        }
                        className={cn(
                          'flex-1 min-w-0',
                          'px-2 py-2 text-xs',
                          'bg-transparent',
                          'border-b',
                          'focus:outline-none',
                          isDarkMode
                            ? 'text-white border-[#4CAF50]/40 focus:border-[#4CAF50]'
                            : 'text-midnight-900 border-[#4CAF50]/40 focus:border-[#4CAF50]'
                        )}
                      />

                      <button
                        onClick={() =>
                          handleSaveTitle(thread.id)
                        }
                        className="p-2 rounded-lg hover:bg-[#4CAF50]/10 transition-colors"
                        aria-label="Save conversation name"
                      >
                        <Check className="w-4 h-4 text-[#4CAF50]" />
                      </button>

                      <button
                        onClick={() => {
                          setEditingThread(null);
                          setEditTitle('');
                        }}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Cancel editing"
                      >
                        <X
                          className={cn(
                            'w-4 h-4',
                            isDarkMode
                              ? 'text-white/40'
                              : 'text-midnight-300'
                          )}
                        />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Thread Content */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className={cn(
                            'text-xs font-medium truncate',
                            isActive
                              ? isDarkMode
                                ? 'text-white'
                                : 'text-midnight-900'
                              : isDarkMode
                                ? 'text-white/65'
                                : 'text-midnight-700'
                          )}
                        >
                          {thread.title}
                        </h3>

                        <p
                          className={cn(
                            'text-[10px] mt-1 tabular-nums',
                            isActive
                              ? 'text-[#4CAF50]/70'
                              : isDarkMode
                                ? 'text-white/25'
                                : 'text-midnight-300'
                          )}
                        >
                          {formatTimestamp(
                            thread.updatedAt
                          )}
                        </p>
                      </div>

                      {/* Edit/Delete Actions */}
                      <div
                        className={cn(
                          'flex items-center gap-0.5',
                          'transition-opacity duration-200',
                          'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
                        )}
                      >
                        <button
                          onClick={(e) =>
                            handleEditClick(
                              e,
                              thread
                            )
                          }
                          className={cn(
                            'w-9 h-9 flex items-center justify-center',
                            'rounded-lg transition-colors',
                            isDarkMode
                              ? 'hover:bg-white/10'
                              : 'hover:bg-midnight-100'
                          )}
                          aria-label="Edit conversation"
                        >
                          <Edit2
                            className={cn(
                              'w-3.5 h-3.5',
                              isDarkMode
                                ? 'text-white/40'
                                : 'text-midnight-300'
                            )}
                          />
                        </button>

                        <button
                          onClick={(e) =>
                            handleDeleteThread(
                              e,
                              thread.id
                            )
                          }
                          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            'px-4 py-3 border-t',
            isDarkMode
              ? 'border-white/5'
              : 'border-midnight-100/50'
          )}
        >
          <p
            className={cn(
              'text-[9px] text-center tracking-wider uppercase',
              isDarkMode
                ? 'text-white/15'
                : 'text-midnight-300'
            )}
          >
            netKathir AI Assistant
          </p>
        </div>

        {/* Desktop Close Button */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'hidden lg:flex absolute',
            'right-[-14px] top-6 z-10',
            'w-7 h-7 items-center justify-center',
            'rounded-full shadow-lg',
            'transition-all duration-300',
            isDarkMode
              ? 'bg-[#0A1628] border border-white/10 hover:bg-white/10'
              : 'bg-white border border-midnight-200/50 hover:bg-ivory-100'
          )}
          aria-label="Close sidebar"
        >
          <ChevronLeft
            className={cn(
              'w-3.5 h-3.5',
              isDarkMode
                ? 'text-white/50'
                : 'text-midnight-400'
            )}
          />
        </button>
      </aside>
    </>
  );
}