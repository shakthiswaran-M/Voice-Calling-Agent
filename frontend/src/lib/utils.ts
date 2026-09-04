// src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Relative timestamp used across the chat UI ("Just now", "5m ago", ...).
 * Lives here (not in the store) so UI components share one implementation.
 */
export function formatTimestamp(date: number): string {
  const now = Date.now();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

/**
 * Copies `text` to the clipboard, falling back to a hidden textarea +
 * `document.execCommand('copy')` for browsers without the async API.
 * Returns true on success (may throw — callers decide how to surface it).
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/** Public share URL for a thread (used by the share modal in both nav + chat). */
export function getThreadShareUrl(threadId: string): string {
  return `${window.location.origin}/share/${threadId}`;
}

/**
 * Gap (ms) after which two consecutive messages get a centered date/time
 * separator — the same rule in the chat UI and the PDF export.
 */
export const TIMELINE_GAP_MS = 5 * 60 * 1000;