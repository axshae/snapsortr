/**
 * ActionBar
 *
 * The main Take / Drop / Skip control strip at the bottom of the review screen.
 * Displays the current image index and keyboard shortcut hints.
 */
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { SelectionState } from '../types';
import { cn } from '../utils/cn';

export function ActionBar() {
  const {
    decideAndAdvance,
    setSelection,
    getFilteredImages,
    focusedIndex,
    selections,
    images,
    currentDirectory,
    activeFilter,
    sortMode,
    navigateImage,
    openViewer,
  } = useAppStore(useShallow((s) => ({
    decideAndAdvance: s.decideAndAdvance,
    setSelection: s.setSelection,
    getFilteredImages: s.getFilteredImages,
    focusedIndex: s.focusedIndex,
    selections: s.selections,
    images: s.images,
    currentDirectory: s.currentDirectory,
    activeFilter: s.activeFilter,
    sortMode: s.sortMode,
    navigateImage: s.navigateImage,
    openViewer: s.openViewer,
  })));

  // Subscribed purely to trigger re-renders when filter/directory/sort changes
  void images;
  void currentDirectory;
  void activeFilter;
  void sortMode;

  const filtered = getFilteredImages();
  const current = filtered[focusedIndex];
  const currentSelection: SelectionState = current
    ? (selections.get(current.id) ?? 'undecided')
    : 'undecided';

  const total = filtered.length;

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 sm:px-4 py-2 sm:py-3 bg-curator-surface border-t border-curator-border">
      {/* Left: navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigateImage('prev')}
          disabled={focusedIndex === 0}
          className="btn-icon"
          title="Previous (← or H)"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-sm text-curator-muted tabular-nums min-w-[5rem] text-center">
          {total > 0 ? `${focusedIndex + 1} / ${total}` : '0 / 0'}
        </span>

        <button
          onClick={() => navigateImage('next')}
          disabled={focusedIndex >= total - 1}
          className="btn-icon"
          title="Next (→ or L)"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Center: action buttons */}
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Drop */}
        <ActionButton
          label="Drop"
          shortcut="F"
          active={currentSelection === 'dropped'}
          colorClass="text-red-400 border-red-500/50 hover:bg-red-500/10"
          activeClass="bg-red-500/20 border-red-500 text-red-300"
          onClick={() => {
            if (current) decideAndAdvance('dropped');
          }}
        />

        {/* Skip */}
        <ActionButton
          label="Skip"
          shortcut="U"
          active={currentSelection === 'undecided'}
          colorClass="text-gray-400 border-gray-500/50 hover:bg-gray-500/10"
          activeClass="bg-gray-500/20 border-gray-500 text-gray-300"
          onClick={() => {
            if (current) {
              setSelection(current.id, current.path, 'undecided');
              // In a filtered tab where marking undecided removes the image
              // (taken or dropped), the focusedIndex already points to the
              // next image after the state update — no need to advance.
              if (activeFilter === 'all' || activeFilter === 'undecided') {
                navigateImage('next');
              }
            }
          }}
        />

        {/* Take */}
        <ActionButton
          label="Take"
          shortcut="J"
          active={currentSelection === 'taken'}
          colorClass="text-green-400 border-green-500/50 hover:bg-green-500/10"
          activeClass="bg-green-500/20 border-green-500 text-green-300"
          onClick={() => {
            if (current) decideAndAdvance('taken');
          }}
        />
      </div>

      {/* Right: zoom + shortcuts hint */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => current && openViewer(focusedIndex)}
          className="btn-icon"
          title="Zoom (Z or Enter)"
          disabled={!current}
        >
          <ZoomIn size={16} />
        </button>

        <div className="hidden lg:flex items-center gap-2 text-xs text-curator-muted border-l border-curator-border pl-3 ml-1">
          <kbd className="kbd">J</kbd><span>take</span>
          <kbd className="kbd">F</kbd><span>drop</span>
          <kbd className="kbd">←/→</kbd><span>nav</span>
          <kbd className="kbd">Z</kbd><span>zoom</span>
          <kbd className="kbd">G</kbd><span>grid</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

interface ActionButtonProps {
  label: string;
  shortcut: string;
  active: boolean;
  colorClass: string;
  activeClass: string;
  onClick: () => void;
}

function ActionButton({
  label,
  shortcut,
  active,
  colorClass,
  activeClass,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-5 sm:py-2 rounded-lg border-2 font-semibold text-sm transition-all',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-curator-surface',
        active ? activeClass : colorClass,
      )}
    >
      {label}
      <kbd
        className={cn(
          'hidden sm:inline-flex text-xs px-1.5 py-0.5 rounded border font-mono',
          active
            ? 'bg-white/10 border-white/20 text-white/70'
            : 'bg-curator-bg border-curator-border text-curator-muted',
        )}
      >
        {shortcut}
      </kbd>
    </button>
  );
}


