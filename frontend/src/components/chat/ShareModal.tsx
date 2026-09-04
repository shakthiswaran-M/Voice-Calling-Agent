// src/components/chat/ShareModal.tsx
//
// Shared "Share conversation" modal used by both the sidebar (ThreadNav) and
// the chat area (message → Forward). Was previously duplicated inline in
// both components with identical markup and handlers.

import { useCallback, useEffect, useState } from 'react';
import { X, Check, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { copyTextToClipboard, getThreadShareUrl } from '../../lib/utils';

interface ShareModalProps {
  threadId: string;
  threadTitle: string;
  isDarkMode?: boolean;
  onClose: () => void;
}

export function ShareModal({ threadId, threadTitle, isDarkMode = false, onClose }: ShareModalProps) {
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle');

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      await copyTextToClipboard(getThreadShareUrl(threadId));
      setCopyLinkState('copied');
      setTimeout(() => setCopyLinkState('idle'), 2500);
    } catch {
      // Clipboard unavailable — leave the modal open; the link is visible in the UI.
    }
  }, [threadId]);

  const handleWhatsAppShare = useCallback(() => {
    const url = getThreadShareUrl(threadId);
    const text = `Check out this conversation: ${threadTitle}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, [threadId, threadTitle]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
      <div
        className={cn('relative w-full max-w-[380px] rounded-2xl border shadow-2xl animate-scale-in overflow-hidden', isDarkMode ? 'bg-[#2f2f2f] border-[#424242]' : 'bg-white border-gray-200')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className={cn('text-sm font-semibold', isDarkMode ? 'text-white' : 'text-gray-900')}>Share conversation</h3>
          <button onClick={onClose} className={cn('p-1 rounded-lg transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/40' : 'hover:bg-gray-100 text-gray-400')} aria-label="Close share dialog">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <p className={cn('text-[11px] px-5 pb-3', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Share this conversation with others</p>

        {/* Thread preview */}
        <div className="mx-5 mb-4">
          <div className={cn('px-4 py-3 rounded-xl border text-[12px] font-medium', isDarkMode ? 'bg-white/[0.03] border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-600')}>
            {threadTitle}
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
          <button onClick={onClose} className={cn('w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]', isDarkMode ? 'text-white/40 hover:text-white/60 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}