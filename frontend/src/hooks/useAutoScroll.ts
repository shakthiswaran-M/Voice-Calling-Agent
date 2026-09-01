import { useRef, useState, useCallback, useEffect } from 'react';

export function useAutoScroll(dependencies: any[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAutoScrollingRef = useRef(false);

  // Check if user is at the bottom of the scroll container
  const checkIsAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= 50;
  }, []);

  // Handle scroll events from the user
  const handleScroll = useCallback(() => {
    // Skip if we're programmatically scrolling
    if (isAutoScrollingRef.current) return;

    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);
    // Only hide the button when user scrolls to bottom
    if (atBottom) {
      setShowScrollButton(false);
    }
  }, [checkIsAtBottom]);

  // Scroll to bottom programmatically
  const scrollToBottom = useCallback((smooth = true) => {
    const container = containerRef.current;
    if (!container) return;

    isAutoScrollingRef.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

    // Reset flag after scroll completes
    const duration = smooth ? 500 : 0;
    setTimeout(() => {
      isAutoScrollingRef.current = false;
      setIsAtBottom(true);
      setShowScrollButton(false);
    }, duration + 50);
  }, []);

  // When user sends a message, force scroll to bottom
  const scrollToBottomOnSend = useCallback(() => {
    setIsAtBottom(true);
    setShowScrollButton(false);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // When new messages arrive (dependencies change)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Recalculate after DOM update
    requestAnimationFrame(() => {
      const atBottom = checkIsAtBottom();
      setIsAtBottom(atBottom);

      if (atBottom) {
        // User is at bottom → auto-scroll to latest
        scrollToBottom(false);
      } else {
        // User scrolled up → show "New messages" button
        setShowScrollButton(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return {
    containerRef,
    isAtBottom,
    showScrollButton,
    handleScroll,
    scrollToBottom,
    scrollToBottomOnSend,
  };
}
