// src/hooks/useAutoScroll.ts

import { useRef, useState, useCallback, useEffect } from 'react';

export function useAutoScroll(dependencies: any[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const checkIsAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 50;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }, [checkIsAtBottom]);

  const scrollToBottom = useCallback((smooth = true) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (isAtBottom) scrollToBottom(false);
  }, [dependencies, isAtBottom, scrollToBottom]);

  const scrollToBottomOnSend = useCallback(() => {
    scrollToBottom(true);
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, [scrollToBottom]);

  return { containerRef, isAtBottom, showScrollButton, handleScroll, scrollToBottom, scrollToBottomOnSend };
}
