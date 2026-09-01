import { useEffect, useRef } from 'react';
import { Copy, Reply, Pin, Forward, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  checked?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  isDarkMode?: boolean;
}

export function ContextMenu({ x, y, items, onClose, isDarkMode = false }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Keep menu inside viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) menuRef.current.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh) menuRef.current.style.top = `${vh - rect.height - 8}px`;
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[200] w-48 py-1.5 rounded-xl border shadow-2xl animate-scale-in',
        isDarkMode ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-gray-200'
      )}
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all duration-150',
            item.variant === 'danger'
              ? 'text-red-400/80 hover:bg-red-500/10 hover:text-red-400'
              : isDarkMode
                ? 'text-white/70 hover:bg-green-500/10 hover:text-white'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          {item.checked ? <Check className="w-3.5 h-3.5 shrink-0 text-green-500" /> : <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export { Copy, Reply, Pin, Forward, Check };
