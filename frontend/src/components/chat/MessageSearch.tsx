import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MessageSearchProps {
  isOpen: boolean;
  onClose: () => void;
  messages: { id: string; content: string }[];
  onNavigateToMessage: (messageId: string) => void;
  isDarkMode?: boolean;
}

export function MessageSearch({ isOpen, onClose, messages, onNavigateToMessage, isDarkMode = false }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search results are derived state — compute them instead of storing them.
  const matches = useMemo(() => {
    if (!query.trim()) return [] as { messageId: string }[];
    const q = query.toLowerCase();
    const results: { messageId: string }[] = [];
    for (const msg of messages) {
      if (msg.content.toLowerCase().includes(q)) {
        results.push({ messageId: msg.id });
      }
    }
    return results;
  }, [query, messages]);

  // Reset the active match whenever the query or the result set changes.
  useEffect(() => {
    setCurrentMatch(0);
  }, [query, matches]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setCurrentMatch(0);
    }
  }, [isOpen]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && matches[currentMatch]) {
      onNavigateToMessage(matches[currentMatch].messageId);
    }
  }, [currentMatch, matches, onNavigateToMessage]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatch(prev => (prev + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatch(prev => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [goNext, goPrev, onClose]);

  if (!isOpen) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 border-b shrink-0 animate-fade-in',
      isDarkMode ? 'bg-[#1a1a1a] border-[#2f2f2f]' : 'bg-gray-50 border-gray-200'
    )}>
      <Search className={cn('w-4 h-4 shrink-0', isDarkMode ? 'text-white/30' : 'text-gray-400')} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search conversation..."
        className={cn(
          'flex-1 bg-transparent text-xs outline-none border-none ring-0 focus:outline-none focus:border-none focus:ring-0 min-w-0',
          isDarkMode ? 'text-white placeholder:text-white/30' : 'text-gray-900 placeholder:text-gray-400'
        )}
      />
      {matches.length > 0 && (
        <span className={cn('text-[10px] font-mono whitespace-nowrap', isDarkMode ? 'text-white/40' : 'text-gray-500')}>
          {currentMatch + 1} / {matches.length}
        </span>
      )}
      {query && matches.length === 0 && (
        <span className={cn('text-[10px] font-mono whitespace-nowrap', isDarkMode ? 'text-white/30' : 'text-gray-400')}>
          No results
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={goPrev}
          disabled={matches.length === 0}
          className={cn('p-1 rounded transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40 disabled:text-white/10' : 'hover:bg-gray-200 text-gray-500 disabled:text-gray-300')}
          aria-label="Previous match"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={goNext}
          disabled={matches.length === 0}
          className={cn('p-1 rounded transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40 disabled:text-white/10' : 'hover:bg-gray-200 text-gray-500 disabled:text-gray-300')}
          aria-label="Next match"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <button onClick={onClose} className={cn('p-1 rounded transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-200 text-gray-500')} aria-label="Close search">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
