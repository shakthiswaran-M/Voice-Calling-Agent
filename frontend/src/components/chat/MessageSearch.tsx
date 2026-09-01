import { useState, useRef, useEffect, useCallback } from 'react';
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
  const [matches, setMatches] = useState<{ messageId: string; matchIndex: number }[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search messages
  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }
    const q = query.toLowerCase();
    const results: { messageId: string; matchIndex: number }[] = [];
    messages.forEach(msg => {
      if (msg.content.toLowerCase().includes(q)) {
        results.push({ messageId: msg.id, matchIndex: 0 });
      }
    });
    setMatches(results);
    setCurrentMatch(0);
  }, [query, messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setMatches([]);
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
      isDarkMode ? 'bg-[#0a0a0a] border-white/5' : 'bg-gray-50 border-gray-200'
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
          'flex-1 bg-transparent text-xs focus:outline-none min-w-0',
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

export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 dark:bg-yellow-600/40 dark:text-yellow-200">{part}</mark>
      : part
  );
}
