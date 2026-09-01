import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { useChatStore } from '../../store/useChatStore';
import type { Thread } from '../../types';
import {
  Plus, Trash2, Edit2, Check, X, Moon, Sun,
  MoreHorizontal, Share2, ExternalLink, Pin, AlertTriangle,
  Search, CheckCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, Download,
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

  // Hover popover state for collapsed bar
  const [hoveredPopover, setHoveredPopover] = useState<string | null>(null);
  const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number }>({ top: 0 });

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const pinnedThreads = threads.filter(t => t.pinned);
  const recentThreads = threads.filter(t => !t.pinned).sort((a, b) => b.updatedAt - a.updatedAt);

  const filterList = (list: Thread[]) => searchQuery.trim()
    ? list.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : list;

  const filteredPinned = filterList(pinnedThreads);
  const filteredRecent = filterList(recentThreads);
  const hasResults = filteredPinned.length + filteredRecent.length > 0;

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

  const showToast = useCallback((msg: string) => setToastMsg(msg), []);

  // Popover hover handlers with delay
  const openPopover = useCallback((id: string, e: React.MouseEvent) => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ top: rect.top });
    setHoveredPopover(id);
  }, []);

  const scheduleClosePopover = useCallback(() => {
    popoverTimeoutRef.current = setTimeout(() => setHoveredPopover(null), 200);
  }, []);

  const cancelClosePopover = useCallback(() => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => { if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current); };
  }, []);

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
    setHoveredPopover(null);
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

  const handleExportMarkdown = useCallback((e: MouseEvent, thread: Thread) => {
    e.stopPropagation();
    const header = `# ${thread.title}\n\nExported on ${new Date().toLocaleDateString()}\n\n---\n\n`;
    const body = thread.messages.map(m => {
      const role = m.role === 'user' ? '**You**' : '**NetKathir**';
      const time = new Date(m.timestamp).toLocaleString();
      return `### ${role} — ${time}\n\n${m.content}\n`;
    }).join('\n---\n\n');
    const blob = new Blob([header + body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${thread.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setOpenMenuId(null);
    showToast('Chat exported as Markdown!');
  }, [showToast]);

  const menuBtnClass = () => cn(
    'w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all duration-150',
    isDarkMode ? 'text-white/70 hover:bg-green-500/10 hover:text-white' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  );

  const renderThreadItem = (thread: Thread) => {
    const isActive = activeThreadId === thread.id;
    return (
      <div key={thread.id} onClick={() => editingId !== thread.id && handleThreadSelect(thread.id)} className={cn('group/thread relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150', isActive ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-900') : (isDarkMode ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'))}>
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
        {/* Action icons — right side */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Pin icon — visible on hover, or always if pinned */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePinThread(thread.id); showToast(thread.pinned ? 'Thread unpinned' : 'Thread pinned'); }}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200',
              thread.pinned
                ? (isDarkMode ? 'text-green-400 hover:text-green-300 hover:bg-white/5' : 'text-green-500 hover:text-green-600 hover:bg-gray-100')
                : (isDarkMode
                    ? 'text-white/20 hover:text-white/50 hover:bg-white/5 opacity-0 group-hover/thread:opacity-100'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover/thread:opacity-100')
            )}
            aria-label={thread.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={cn('w-3.5 h-3.5', thread.pinned && 'fill-green-500')} />
          </button>

          {/* Three-dot menu — always visible */}
          <div className="relative" ref={openMenuId === thread.id ? menuRef : undefined}>
            <button
              onClick={(e) => toggleMenu(e, thread.id)}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200',
                openMenuId === thread.id
                  ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-200 text-gray-700')
                  : (isDarkMode ? 'text-white/20 hover:text-white/50 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')
              )}
              aria-label="More"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {openMenuId === thread.id && (
              <div className={cn('absolute right-0 top-full mt-1 z-50 w-48 py-1.5 rounded-xl border shadow-xl animate-scale-in origin-top-right', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')} onClick={(e) => e.stopPropagation()}>
                <button onClick={(e) => handlePin(e, thread.id)} className={menuBtnClass()}><Pin className={cn('w-3.5 h-3.5 shrink-0', thread.pinned && 'fill-green-500 text-green-500')} />{thread.pinned ? 'Unpin' : 'Pin to top'}</button>
                <button onClick={(e) => handleRename(e, thread)} className={menuBtnClass()}><Edit2 className="w-3.5 h-3.5 shrink-0" />Rename</button>
                <button onClick={(e) => handleShare(e, thread)} className={menuBtnClass()}><Share2 className="w-3.5 h-3.5 shrink-0" />Share</button>
                <button onClick={(e) => handleOpenInNewTab(e)} className={menuBtnClass()}><ExternalLink className="w-3.5 h-3.5 shrink-0" />Open in new tab</button>
                <button onClick={(e) => handleExportMarkdown(e, thread)} className={menuBtnClass()}><Download className="w-3.5 h-3.5 shrink-0" />Export as Markdown</button>
                <div className={cn('mx-3 my-1 h-px', isDarkMode ? 'bg-white/5' : 'bg-gray-100')} />
                <button onClick={(e) => handleDeleteClick(e, thread.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all duration-150 text-red-400/80 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="w-3.5 h-3.5 shrink-0" />Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const sectionLabel = (text: string) => (
    <p className={cn('text-[10px] font-semibold uppercase tracking-wider px-3 pt-3 pb-1', isDarkMode ? 'text-white/25' : 'text-gray-400')}>{text}</p>
  );

  // ─── Popover panel content for pinned/recent threads ───
  const renderPopoverThreads = (items: Thread[], label: string) => (
    <div className={cn('w-64 rounded-xl border shadow-2xl overflow-hidden animate-scale-in', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')} onMouseEnter={cancelClosePopover} onMouseLeave={scheduleClosePopover}>
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1.5', isDarkMode ? 'text-white/30' : 'text-gray-400')}>{label}</p>
      <div className="max-h-64 overflow-y-auto px-1.5 pb-1.5">
        {items.length === 0 ? (
          <p className={cn('text-[11px] px-4 py-3', isDarkMode ? 'text-white/30' : 'text-gray-400')}>No {label.toLowerCase()} yet</p>
        ) : items.map(thread => {
          const isActive = activeThreadId === thread.id;
          return (
            <button
              key={thread.id}
              onClick={() => handleThreadSelect(thread.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150',
                isActive
                  ? (isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-900')
                  : (isDarkMode ? 'text-white/60 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50')
              )}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: isDarkMode ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)', color: '#22C55E' }}>
                {thread.title.charAt(0).toUpperCase()}
              </div>
              <span className="text-[12px] font-medium truncate">{thread.title}</span>
            </button>
          );
        })}
      </div>
    </div>
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

      {/* ═══ COLLAPSED VERTICAL BAR (desktop only, when sidebar closed) ═══ */}
      {!isSidebarOpen && (
        <div className={cn('hidden lg:flex fixed left-0 top-0 z-[55] flex-col items-center gap-0.5 py-3 px-1 h-full w-[52px] border-r', isDarkMode ? 'bg-[#111] border-white/5' : 'bg-[#f9f9f9] border-gray-200')}>
          {/* Open sidebar */}
          <button
            onClick={toggleSidebar}
            className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-95', isDarkMode ? 'hover:bg-white/10 text-white/50' : 'hover:bg-gray-200 text-gray-500')}
            aria-label="Open sidebar"
          >
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>

          {/* Divider */}
          <div className={cn('w-6 h-px my-1.5', isDarkMode ? 'bg-white/10' : 'bg-gray-200')} />

          {/* Search */}
          <button
            onClick={() => { toggleSidebar(); setTimeout(() => searchInputRef.current?.focus(), 350); }}
            className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-400')}
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          {/* Pinned — hover popover */}
          {pinnedThreads.length > 0 && (
            <div
              className="relative"
              onMouseEnter={(e) => openPopover('pinned', e)}
              onMouseLeave={scheduleClosePopover}
            >
              <button
                className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-400')}
                aria-label="Pinned threads"
              >
                <Pin className="w-[18px] h-[18px]" />
              </button>
              {hoveredPopover === 'pinned' && (
                <div className="fixed left-[56px] z-[60]" style={{ top: `${popoverPos.top}px` }}>
                  {renderPopoverThreads(pinnedThreads, 'Pinned')}
                </div>
              )}
            </div>
          )}

          {/* Recent — hover popover */}
          {recentThreads.length > 0 && (
            <div
              className="relative"
              onMouseEnter={(e) => openPopover('recent', e)}
              onMouseLeave={scheduleClosePopover}
            >
              <button
                className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-400')}
                aria-label="Recent threads"
              >
                <MessageSquare className="w-[18px] h-[18px]" />
              </button>
              {hoveredPopover === 'recent' && (
                <div className="fixed left-[56px] z-[60]" style={{ top: `${popoverPos.top}px` }}>
                  {renderPopoverThreads(recentThreads, 'Recent')}
                </div>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <button onClick={toggleDarkMode} className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all', isDarkMode ? 'hover:bg-white/5 text-white/30' : 'hover:bg-gray-200 text-gray-400')} aria-label="Toggle theme">
            {isDarkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>
      )}

      {/* ═══ FULL SIDEBAR ═══ */}
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
              <PanelLeftClose className="w-4 h-4" />
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
              {!searchQuery && <kbd className={cn('text-[9px] font-mono px-1 py-0.5 rounded border hidden sm:inline', isDarkMode ? 'border-white/10 text-white/20' : 'border-gray-200 text-gray-300')}>Ctrl+K</kbd>}
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className={cn('p-0.5 rounded transition-colors shrink-0', isDarkMode ? 'hover:bg-white/10 text-white/30' : 'hover:bg-gray-200 text-gray-400')}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {!hasResults ? (
              <div className="text-center py-12 px-4">
                <MessageSquare className={cn('w-8 h-8 mx-auto mb-2', isDarkMode ? 'text-white/15' : 'text-gray-300')} />
                <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-gray-400')}>
                  {searchQuery ? 'No results' : 'No conversations yet'}
                </p>
              </div>
            ) : (
              <>
                {filteredPinned.length > 0 && (
                  <div>
                    {sectionLabel('Pinned')}
                    {filteredPinned.map(renderThreadItem)}
                  </div>
                )}
                {filteredRecent.length > 0 && (
                  <div>
                    {sectionLabel('Recent')}
                    {filteredRecent.map(renderThreadItem)}
                  </div>
                )}
              </>
            )}
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
