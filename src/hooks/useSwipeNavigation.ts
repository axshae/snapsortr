/**
 * useSwipeNavigation
 *
 * Detects left/right swipes and triggers navigation callbacks.
 * Swipe threshold: 50px horizontal with minimal vertical movement (~30px).
 */
import { useEffect, useRef } from 'react';

interface UseSwipeNavigationProps {
  onSwipeLeft?: () => void;  // Swipe left → next image
  onSwipeRight?: () => void; // Swipe right → prev image
  enabled?: boolean;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: UseSwipeNavigationProps) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
      touchStartY.current = e.touches[0]?.clientY ?? null;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touchEndX = e.changedTouches[0]?.clientX ?? null;
      const touchEndY = e.changedTouches[0]?.clientY ?? null;

      if (touchEndX === null || touchEndY === null) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }

      const deltaX = touchEndX - touchStartX.current;
      const deltaY = Math.abs(touchEndY - touchStartY.current);

      // Require at least 50px horizontal movement with vertical < 30px
      const SWIPE_THRESHOLD = 50;
      const MAX_VERTICAL_DRIFT = 30;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < MAX_VERTICAL_DRIFT) {
        if (deltaX > 0) {
          // Swipe right → previous
          onSwipeRight?.();
        } else {
          // Swipe left → next
          onSwipeLeft?.();
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, onSwipeLeft, onSwipeRight]);
}
