/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts for the image review workflow.
 * All handlers are stable references (useCallback / useEffect).
 *
 * Shortcuts:
 *   ArrowRight / l    → next image
 *   ArrowLeft  / h    → previous image
 *   t                 → take
 *   d                 → drop
 *   u / s             → undecided (skip)
 *   j                 → take + advance
 *   f                 → drop + advance
 *   z / Enter         → open zoom viewer
 *   Escape            → close zoom viewer
 *   g                 → toggle grid/single view
 */
import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useKeyboardShortcuts(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const {
        navigateImage,
        decideAndAdvance,
        setSelection,
        getFilteredImages,
        focusedIndex,
        isViewerOpen,
        openViewer,
        closeViewer,
        setViewMode,
        viewMode,
      } = useAppStore.getState();

      const filtered = getFilteredImages();
      const current = filtered[focusedIndex];

      switch (e.key) {
        // ── Navigation ────────────────────────────────────────────────────
        case 'ArrowRight':
        case 'l':
          // YARL handles its own arrow-key navigation when the viewer is open;
          // letting this fall through would advance the gallery index too.
          if (isViewerOpen) break;
          e.preventDefault();
          navigateImage('next');
          break;
        case 'ArrowLeft':
        case 'h':
          if (isViewerOpen) break;
          e.preventDefault();
          navigateImage('prev');
          break;

        // ── Decisions (mark only, no advance) ────────────────────────────
        case 't':
          if (current) setSelection(current.id, current.path, 'taken');
          break;
        case 'd':
          if (current) setSelection(current.id, current.path, 'dropped');
          break;
        case 'u':
        case 's':
          if (current) setSelection(current.id, current.path, 'undecided');
          break;

        // ── Rapid sort (decide + advance) ─────────────────────────────────
        case 'j':
          decideAndAdvance('taken');
          break;
        case 'f':
          decideAndAdvance('dropped');
          break;

        // ── Viewer ────────────────────────────────────────────────────────
        case 'z':
        case 'Enter':
          if (!isViewerOpen) openViewer(focusedIndex);
          break;
        case 'Escape':
          if (isViewerOpen) closeViewer();
          break;

        // ── View mode ─────────────────────────────────────────────────────
        case 'g':
          setViewMode(viewMode === 'single' ? 'grid' : 'single');
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
