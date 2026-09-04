import { useRef, useState, useCallback, useEffect } from 'react';

interface ScrollTrackingState {
  threadId: string | null;
  lastVisibleMessageId: string | null;
  scrollOffset: number;
  isAtBottom: boolean;
  isRestoringScroll: boolean;
}

interface UseAutoScrollOptions {
  threadId: string | null;
  messages: { id: string }[];
  /** Called when the visible message changes (throttled). */
  onPositionChange: (threadId: string, messageId: string, offset: number) => void;
  /** Restore target: set this before switching threads. */
  restorationTarget: { messageId: string; offset: number } | null;
  /** Clear the restore target after restoration is complete. */
  onRestoreComplete: () => void;
}

export function useAutoScroll({
  threadId,
  messages,
  onPositionChange,
  restorationTarget,
  onRestoreComplete,
}: UseAutoScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  // ── Core tracking refs ──
  const trackingRef = useRef<ScrollTrackingState>({
    threadId: null as string | null,
    lastVisibleMessageId: null,
    scrollOffset: 0,
    isAtBottom: true,
    isRestoringScroll: false,
  });
  const isAutoScrollingRef = useRef(false);
  const hasSentRef = useRef(false);
  // True from the moment the user sends until they manually scroll away from
  // the bottom: while set, incoming replies scroll into view even if the
  // geometric "at bottom" check misses (e.g. the typing indicator being
  // replaced by a taller bot message shifts the bottom edge).
  const followTailRef = useRef(false);
  const prevThreadIdRef = useRef<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleMessagesRef = useRef<Map<string, DOMRect>>(new Map());
  const lastSavedMessageRef = useRef<string | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync refs with props ──
  useEffect(() => {
    trackingRef.current.threadId = threadId;
  }, [threadId]);

  // ── Throttled position save ──
  const throttledSave = useCallback(
    (messageId: string, offset: number) => {
      if (!threadId || trackingRef.current.isRestoringScroll) return;
      if (messageId === lastSavedMessageRef.current) return;
      lastSavedMessageRef.current = messageId;
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = setTimeout(() => {
        onPositionChange(threadId, messageId, offset);
      }, 300);
    },
    [threadId, onPositionChange],
  );

  // ── Compute "at bottom" from container ──
  const checkIsAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 50;
  }, []);

  // ── Handle user scroll events ──
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // A programmatic scroll is in flight. Release the guard as soon as the
    // animation actually reaches the bottom so the position is treated as a
    // user position again (the fallback timer in `scrollToBottom` covers the
    // case where no scroll event fires, e.g. already at the bottom).
    if (isAutoScrollingRef.current) {
      if (checkIsAtBottom()) {
        isAutoScrollingRef.current = false;
        trackingRef.current.isAtBottom = true;
        setIsScrolledUp(false);
        setShowScrollButton(false);
      }
      return;
    }

    if (trackingRef.current.isRestoringScroll) return;

    const atBottom = checkIsAtBottom();
    trackingRef.current.isAtBottom = atBottom;
    setIsScrolledUp(!atBottom);
    if (atBottom) {
      setShowScrollButton(false);
    } else {
      // The user scrolled away from the tail — stop following new messages.
      followTailRef.current = false;
    }
  }, [checkIsAtBottom]);

  // ── Programmatic scroll to bottom ──
  const scrollToBottom = useCallback((smooth = true) => {
    const container = containerRef.current;
    if (!container) return;

    isAutoScrollingRef.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

    // Fallback guard release. Normally `handleScroll` releases the guard as
    // soon as the bottom is reached; this timer only kicks in when no scroll
    // event fires (e.g. the container is already at the bottom). Re-measure
    // instead of force-flagging so a mid-animation interruption isn't masked.
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    const duration = smooth ? 500 : 0;
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      isAutoScrollingRef.current = false;
      const atBottom = checkIsAtBottom();
      trackingRef.current.isAtBottom = atBottom;
      setIsScrolledUp(!atBottom);
      if (atBottom) setShowScrollButton(false);
    }, duration + 100);
  }, [checkIsAtBottom]);

  // ── Scroll to bottom when user sends a message ──
  // The actual scroll happens in the `[messages.length]` effect below, AFTER
  // React has committed the new message to the DOM. Scrolling here would read
  // a stale `scrollHeight` (the new bubble is not rendered yet) and leave the
  // user's own message below the fold.
  const scrollToBottomOnSend = useCallback(() => {
    hasSentRef.current = true;
    followTailRef.current = true;
    trackingRef.current.isRestoringScroll = false;
    trackingRef.current.isAtBottom = true;
    setIsScrolledUp(false);
    setShowScrollButton(false);
  }, []);

  // ── Re-check after scrolling ──
  // The message list height is not always final at commit time (the typing
  // indicator is replaced by the reply, markdown/list content settles, fonts
  // swap, ...). A single scroll measured too early can land short with no
  // further event to correct it. Watch for a short while and re-scroll until
  // the tail is actually at the bottom or the user scrolls away.
  const settleToBottom = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    let checks = 0;
    const check = () => {
      checks += 1;
      const container = containerRef.current;
      if (!container || checks > 12) return; // give up after ~1.2s

      // The user took over and scrolled away — stop following.
      if (!followTailRef.current && !checkIsAtBottom()) return;

      if (!checkIsAtBottom()) {
        scrollToBottom(false);
        settleTimerRef.current = setTimeout(check, 100);
      } else if (checks <= 3) {
        // Looks settled; give the layout a few more frames before trusting it.
        settleTimerRef.current = setTimeout(check, 100);
      }
    };
    settleTimerRef.current = setTimeout(check, 60);
  }, [checkIsAtBottom, scrollToBottom]);

  // ── IntersectionObserver: track which message is visible ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    visibleMessagesRef.current.clear();
    lastSavedMessageRef.current = null;

    const observer = new IntersectionObserver(
      (entries) => {
        // Don't track during restoration — it would overwrite the restore position
        if (trackingRef.current.isRestoringScroll) return;

        for (const entry of entries) {
          const msgId = entry.target.getAttribute('data-msg-id');
          if (!msgId) continue;
          if (entry.isIntersecting) {
            visibleMessagesRef.current.set(msgId, entry.boundingClientRect);
          } else {
            visibleMessagesRef.current.delete(msgId);
          }
        }

        // Find the topmost visible message (closest to top of viewport)
        let topMsgId: string | null = null;
        let topDist = Infinity;
        for (const [id, rect] of visibleMessagesRef.current) {
          if (rect.top < topDist) {
            topDist = rect.top;
            topMsgId = id;
          }
        }

        if (topMsgId && container) {
          throttledSave(topMsgId, container.scrollTop);
        }
      },
      {
        root: container,
        // Trigger when message enters the top 40% of the viewport
        rootMargin: '0px 0px -60% 0px',
        threshold: 0,
      },
    );

    observerRef.current = observer;

    // Observe all message elements
    const msgElements = container.querySelectorAll('[data-msg-id]');
    msgElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [messages, throttledSave]); // Re-observe when messages change

  // ── Thread switching: restore position or scroll to bottom ──
  useEffect(() => {
    const container = containerRef.current;
    const prevThreadId = prevThreadIdRef.current;
    prevThreadIdRef.current = threadId;

    // Skip on first render
    if (!threadId || !container) return;

    // If the thread didn't actually change, skip
    if (prevThreadId === threadId) return;

    // New thread context: stop following the previous thread's tail.
    followTailRef.current = false;

    // ── First-time thread: no messages yet → skip (will handle on messages change) ──
    if (messages.length === 0) {
      trackingRef.current.isRestoringScroll = true;
      return;
    }

    // ── Has restoration target → restore it ──
    if (restorationTarget) {
      trackingRef.current.isRestoringScroll = true;
      setShowScrollButton(false);

      // Wait for DOM to render, then scroll to the target
      requestAnimationFrame(() => {
        const targetEl = container.querySelector(`[data-msg-id="${restorationTarget.messageId}"]`);
        if (targetEl) {
          // Scroll to the target message with its saved offset
          container.scrollTop = (targetEl as HTMLElement).offsetTop - restorationTarget.offset;
          // Mark restoration complete after a brief settle period
          restoreTimeoutRef.current = setTimeout(() => {
            trackingRef.current.isRestoringScroll = false;
            trackingRef.current.isAtBottom = checkIsAtBottom();
            setIsScrolledUp(!trackingRef.current.isAtBottom);
            // If user is near the bottom after restoration, hide the scroll button
            if (trackingRef.current.isAtBottom) setShowScrollButton(false);
            onRestoreComplete();
          }, 150);
        } else {
          // Fallback: target message not found, go to bottom
          container.scrollTop = container.scrollHeight;
          trackingRef.current.isRestoringScroll = false;
          trackingRef.current.isAtBottom = true;
          setIsScrolledUp(false);
          onRestoreComplete();
        }
      });
    } else {
      // ── No restoration target: new/unknown thread → scroll to bottom ──
      trackingRef.current.isRestoringScroll = true;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        trackingRef.current.isRestoringScroll = false;
        trackingRef.current.isAtBottom = true;
        setIsScrolledUp(false);
        setShowScrollButton(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.length]);

  // ── Auto-scroll for new messages (smart: respects user position + restoration) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // A message was just sent. The DOM now contains it (this effect runs after
    // commit), so measure the real `scrollHeight` and bring the newest content
    // into view. `scrollToBottomOnSend` only flags the intent.
    if (hasSentRef.current) {
      hasSentRef.current = false;
      requestAnimationFrame(() => {
        scrollToBottom(true);
        settleToBottom();
      });
      return;
    }

    // Skip during restoration — it overrides everything
    if (trackingRef.current.isRestoringScroll) return;

    requestAnimationFrame(() => {
      // A programmatic scroll (e.g. the one started by the send) is still
      // animating — keep it pointed at the newest bottom instead of judging
      // "at bottom" mid-flight and wrongly showing the scroll button.
      if (isAutoScrollingRef.current) {
        scrollToBottom(true);
        settleToBottom();
        return;
      }

      const atBottom = checkIsAtBottom();
      trackingRef.current.isAtBottom = atBottom;
      setIsScrolledUp(!atBottom);
      // While the user is following the tail (they just sent and haven't
      // scrolled away), always bring the new content into view — the raw
      // geometric check can miss when the typing indicator is replaced by a
      // taller bot message, which shifts the bottom edge mid-conversation.
      if (atBottom || followTailRef.current) {
        scrollToBottom(false);
        settleToBottom();
      } else {
        setShowScrollButton(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ── Cleanup timers on unmount ──
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  return {
    containerRef,
    showScrollButton,
    setShowScrollButton,
    isScrolledUp,
    handleScroll,
    scrollToBottom,
    scrollToBottomOnSend,
    isRestoringScroll: trackingRef.current.isRestoringScroll,
  };
}
