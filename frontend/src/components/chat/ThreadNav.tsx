import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { useChatStore } from '../../store/useChatStore';
import type { Thread } from '../../types';
import {
  Plus, Trash2, Edit2, Check, X, Moon, Sun,
  MoreHorizontal, Share2, ExternalLink, Pin, AlertTriangle,
  Search, CheckCircle, MessageSquare, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import logo from '../../assets/netkathir-logo.png';

export function ThreadNav() {
  const {
    threads, activeThreadId, isDarkMode, isSidebarOpen,
    createThread, deleteThread, updateThreadTitle, togglePinThread,
    setActiveThread, toggleDarkMode, toggleSidebar,
  } = useChatStore();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const sortedThreads = [...threads].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const filteredThreads = searchQuery.trim()
    ? sortedThreads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedThreads;

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

  const showToast = useCallback((msg: string) => setToastMsg(msg), []);

  const handleDeleteClick = useCallback((e: MouseEvent, threadId: string) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setDeleteConfirmId(threadId);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteConfirmId) { deleteThread(deleteConfirmId); setDeleteConfirmId(null); }
  }, [deleteConfirmId, deleteThread]);

  const cancelDelete = useCallback(() => setDeleteConfirmId(null), []);

  const handleRename = useCallback((e: MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setEditingId(thread.id);
    setEditTitle(thread.title);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, []);

  const saveRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      updateThreadTitle(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  }, [editingId, editTitle, updateThreadTitle]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle('');
  }, []);

  const handleEditKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') saveRename();
    else if (e.key === 'Escape') cancelRename();
  }, [saveRename, cancelRename]);

  const handleThreadSelect = useCallback((threadId: string) => {
    setActiveThread(threadId);
    if (window.innerWidth < 1024) toggleSidebar();
  }, [setActiveThread, toggleSidebar]);

  const handleNewChat = useCallback(() => {
    createThread();
    if (window.innerWidth < 1024) toggleSidebar();
  }, [createThread, toggleSidebar]);

  const toggleMenu = useCallback((e: MouseEvent, threadId: string) => {
    e.stopPropagation();
    setOpenMenuId(prev => prev === threadId ? null : threadId);
  }, []);

  const handlePin = useCallback((e: MouseEvent, threadId: string) => {
    e.stopPropagation();
    togglePinThread(threadId);
    setOpenMenuId(null);
    showToast('Thread pinned');
  }, [togglePinThread, showToast]);

  const handleShare = useCallback(async (e: MouseEvent, thread: Thread) => {
    e.stopPropagation();
    const shareText = thread.title + '\n' + window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareText);
        setOpenMenuId(null);
        showToast('Link copied to clipboard!');
        return;
      }
    } catch { /* fallback */ }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setOpenMenuId(null);
      showToast('Link copied to clipboard!');
    } catch {
      setOpenMenuId(null);
      showToast('Failed to copy link');
    }
  }, [showToast]);

  const handleOpenInNewTab = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    window.open(window.location.href, '_blank');
    setOpenMenuId(null);
  }, []);

  const menuBtnClass = () => cn(
    'w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all duration-150',
    isDarkMode ? 'text-white/70 hover:bg-green-500/10 hover:text-white' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  );

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden transition-opacity duration-300',
          isDarkMode ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/25 backdrop-blur-sm',
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={toggleSidebar}
      />

      {/* Desktop open button — only when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className={cn(
            'hidden lg:flex fixed left-4 top-4 z-[55] items-center justify-center w-9 h-9 rounded-lg',
            'transition-all duration-200 active:scale-95',
            isDarkMode ? 'bg-[#171717] border border-white/10 text-white/60 hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 shadow-sm'
          )}
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      {/* Sidebar — CSS handles position */}
      <aside className={cn('chat-sidebar', isSidebarOpen && 'open')}>
        <div className={cn('flex flex-col h-full border-r', isDarkMode ? 'bg-[#171717] border-white/5' : 'bg-[#f9f9f9] border-gray-200')}>
          {/* Header */}
          <div className="p-3 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-green-50 border border-green-200">
                <img src={logo} alt="netKathir" className="w-6 h-6 object-contain" />
              </div>
              <h1 className={cn('text-sm font-bold', isDarkMode ? 'text-white' : 'text-gray-900')}>NetKathir</h1>
            </div>
            <button onClick={toggleSidebar} className={cn('p-1.5 rounded-lg transition-all active:scale-95', isDarkMode ? 'hover:bg-white/10 text-white/50' : 'hover:bg-gray-200 text-gray-400')} aria-label="Close sidebar">
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
          </div>

          {/* New Chat */}
          <div className="px-3 pb-2">
            <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] bg-green-500 text-white hover:bg-green-600">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New chat
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-1">
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border transition-all focus-within:border-green-400', isDarkMode ? 'bg-white/[0.03] border-white/10' : 'bg-white border-gray-200')}>
              <Search className={cn('w-3.5 h-3.5 shrink-0', isDarkMode ? 'text-white/30' : 'text-gray-400')} />
              <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className={cn('flex-1 bg-transparent text-xs focus:outline-none border-none min-w-0', isDarkMode ? 'text-white placeholder:text-white/30' : 'text-gray-900 placeholder:text-gray-400')} />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className={cn('p-0.5 rounded transition-colors shrink-0', isDarkMode ? 'hover:bg-white/10 text-white/30' : 'hover:bg-gray-200 text-gray-400')}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {filteredThreads.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare className={cn('w-8 h-8 mx-auto mb-2', isDarkMode ? 'text-white/15' : 'text-gray-300')} />
                <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-gray-400')}>
                  {searchQuery ? 'No results' : 'No conversations yet'}
                </p>
              </div>
            ) : filteredThreads.map((thread) => {
              const isActive = activeThreadId === thread.id;
              return (
                <div key={thread.id} onClick={() => editingId !== thread.id && handleThreadSelect(thread.id)} className={cn('group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150', isActive ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-900') : (isDarkMode ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'))}>
                  <div className="flex-1 min-w-0">
                    {editingId === thread.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input ref={editInputRef} type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={saveRename} onKeyDown={handleEditKeyDown} className={cn('flex-1 min-w-0 px-1.5 py-0.5 text-[13px] bg-transparent border-b focus:outline-none', isDarkMode ? 'text-white border-white/20 focus:border-green-400' : 'text-gray-900 border-gray-300 focus:border-green-500')} />
                        <button onClick={saveRename} className="p-1 rounded hover:bg-green-500/10"><Check className="w-3 h-3 text-green-500" /></button>
                        <button onClick={cancelRename} className="p-1 rounded hover:bg-gray-200"><X className={cn('w-3 h-3', isDarkMode ? 'text-white/40' : 'text-gray-400')} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {thread.pinned && <Pin className="w-2.5 h-2.5 text-green-500 shrink-0 fill-green-500" />}
                        <h3 className="text-[13px] font-medium truncate">{thread.title}</h3>
                      </div>
                    )}
                  </div>
                  <div className="relative shrink-0" ref={openMenuId === thread.id ? menuRef : undefined}>
                    <button onClick={(e) => toggleMenu(e, thread.id)} className={cn('w-7 h-7 flex items-center justify-center rounded-md transition-all', openMenuId === thread.id ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-700') : (isDarkMode ? 'text-white/20 hover:text-white/50 hover:bg-white/5 opacity-0 group-hover:opacity-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100'))} aria-label="More">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {openMenuId === thread.id && (
                      <div className={cn('absolute right-0 top-full mt-1 z-50 w-48 py-1.5 rounded-xl border shadow-xl animate-scale-in origin-top-right', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handlePin(e, thread.id)} className={menuBtnClass()}><Pin className={cn('w-3.5 h-3.5 shrink-0', thread.pinned && 'fill-green-500 text-green-500')} />{thread.pinned ? 'Unpin' : 'Pin to top'}</button>
                        <button onClick={(e) => handleRename(e, thread)} className={menuBtnClass()}><Edit2 className="w-3.5 h-3.5 shrink-0" />Rename</button>
                        <button onClick={(e) => handleShare(e, thread)} className={menuBtnClass()}><Share2 className="w-3.5 h-3.5 shrink-0" />Share</button>
                        <button onClick={(e) => handleOpenInNewTab(e)} className={menuBtnClass()}><ExternalLink className="w-3.5 h-3.5 shrink-0" />Open in new tab</button>
                        <div className={cn('mx-3 my-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-gray-100')} />
                        <button onClick={(e) => handleDeleteClick(e, thread.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all duration-150 text-red-400/80 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="w-3.5 h-3.5 shrink-0" />Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className={cn('px-4 py-2 border-t flex items-center justify-between', isDarkMode ? 'border-white/5' : 'border-gray-200')}>
            <p className={cn('text-[10px]', isDarkMode ? 'text-white/20' : 'text-gray-400')}>netKathir AI</p>
            <button onClick={toggleDarkMode} className={cn('p-1.5 rounded-md transition-all', isDarkMode ? 'hover:bg-white/5 text-white/40' : 'hover:bg-gray-200 text-gray-400')} aria-label="Toggle theme">
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Delete Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={cancelDelete}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className={cn('relative w-full max-w-[300px] rounded-2xl p-5 border shadow-2xl animate-scale-in', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')} onClick={(e) => e.stopPropagation()}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3', isDarkMode ? 'bg-red-500/10' : 'bg-red-50')}>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className={cn('text-sm font-semibold text-center mb-1.5', isDarkMode ? 'text-white' : 'text-gray-900')}>Delete conversation?</h3>
            <p className={cn('text-[11px] text-center leading-relaxed mb-5', isDarkMode ? 'text-white/50' : 'text-gray-500')}>This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={cancelDelete} className={cn('flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]', isDarkMode ? 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200')}>Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all active:scale-[0.97]">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-slide-up max-w-[90vw]">
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md', isDarkMode ? 'bg-[#1a1a1a]/95 border-white/10 text-white' : 'bg-white/95 border-gray-200 text-gray-900')}>
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-xs font-medium">{toastMsg}</span>
          </div>
        </div>
      )}
    </>
  );
}
