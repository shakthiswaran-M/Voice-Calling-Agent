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
  const [shareThreadId, setShareThreadId] = useState<string | null>(null);
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle');
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

  const getShareUrl = useCallback((threadId: string) => {
    return `${window.location.origin}/share/${threadId}`;
  }, []);

  const handleShare = useCallback((e: MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setShareThreadId(thread.id);
    setCopyLinkState('idle');
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareThreadId) return;
    const url = getShareUrl(shareThreadId);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyLinkState('copied');
      setTimeout(() => setCopyLinkState('idle'), 2500);
    } catch {
      showToast('Failed to copy link');
    }
  }, [shareThreadId, getShareUrl, showToast]);

  const handleWhatsAppShare = useCallback(() => {
    if (!shareThreadId) return;
    const url = getShareUrl(shareThreadId);
    const thread = threads.find(t => t.id === shareThreadId);
    const text = thread ? `Check out this conversation: ${thread.title}\n${url}` : url;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, [shareThreadId, getShareUrl, threads]);

  const closeShareModal = useCallback(() => {
    setShareThreadId(null);
    setCopyLinkState('idle');
  }, []);

  // Close share modal on Escape
  useEffect(() => {
    if (!shareThreadId) return;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeShareModal();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [shareThreadId, closeShareModal]);

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
              {(thread.unreadCount || 0) > 0 && !isActive && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold px-1">
                  {thread.unreadCount}
                </span>
              )}
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
              <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-green-50 border border-green-200">
                <img src={logo} alt="netKathir" className="w-11 h-11 object-contain animate-float" />
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

      {/* Share Modal */}
      {shareThreadId && (() => {
        const thread = threads.find(t => t.id === shareThreadId);
        if (!thread) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={closeShareModal}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
            <div
              className={cn('relative w-full max-w-[380px] rounded-2xl border shadow-2xl animate-scale-in overflow-hidden', isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200')}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className={cn('text-sm font-semibold', isDarkMode ? 'text-white' : 'text-gray-900')}>Share conversation</h3>
                <button onClick={closeShareModal} className={cn('p-1 rounded-lg transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-100 text-gray-400')}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className={cn('text-[11px] px-5 pb-3', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Share this conversation with others</p>

              {/* Thread preview */}
              <div className="mx-5 mb-4">
                <div className={cn('px-4 py-3 rounded-xl border text-[12px] font-medium', isDarkMode ? 'bg-white/[0.03] border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-600')}>
                  {thread.title}
                </div>
              </div>

              {/* Share actions */}
              <div className="px-5 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* WhatsApp */}
                  <button
                    onClick={handleWhatsAppShare}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold text-white bg-[#25D366] hover:bg-[#20BD5C] transition-all duration-200 active:scale-[0.97] hover:shadow-lg hover:shadow-[#25D366]/20"
                  >
                    {/* WhatsApp icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </button>

                  {/* Copy Link */}
                  <button
                    onClick={handleCopyShareLink}
                    className={cn(
                      'flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.97]',
                      copyLinkState === 'copied'
                        ? 'bg-green-500 text-white'
                        : (isDarkMode ? 'bg-white/10 text-white hover:bg-white/15 border border-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')
                    )}
                  >
                    {copyLinkState === 'copied' ? (
                      <><Check className="w-4 h-4" /> Link copied</>
                    ) : (
                      <><Share2 className="w-4 h-4" /> Copy link</>
                    )}
                  </button>
                </div>
              </div>

              {/* Cancel */}
              <div className="px-5 pb-5 pt-2">
                <button onClick={closeShareModal} className={cn('w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]', isDarkMode ? 'text-white/40 hover:text-white/60 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
