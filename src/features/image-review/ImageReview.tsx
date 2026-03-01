/**
 * ImageReview — Step 2
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Header: breadcrumb + filter tabs + view-mode toggle        │
 *   ├────────────────┬─────────────────────────────────────────────┤
 *   │  Sidebar       │  Main content area                          │
 *   │  (directory    │  ┌─────────────────────────────────────────┐│
 *   │   tree)        │  │ Single view  –or–  Grid view            ││
 *   │                │  └─────────────────────────────────────────┘│
 *   │                │  Action bar                                  │
 *   └────────────────┴─────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import React from 'react';
import { RotateCcw, Square, LayoutGrid, Image, ArrowDownAZ, Clock, HardDrive, Download, Home, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { DirectorySidebar } from '../../components/DirectorySidebar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { FilterTabs } from '../../components/FilterTabs';
import { ActionBar } from '../../components/ActionBar';
import { VirtualizedGallery } from './VirtualizedGallery';
import { ImageViewer } from './ImageViewer';
import { cn } from '../../utils/cn';
import { SelectionState, SortMode, ImageFile } from '../../types';

export function ImageReview() {
  useKeyboardShortcuts(true);

  const {
    setStep,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
    focusedIndex,
    setFocusedIndex,
    isViewerOpen,
    openViewer,
    closeViewer,
    getFilteredImages,
    // subscribe to these so component re-renders when they change
    images,
    selections,
    currentDirectory,
    activeFilter,
    getStats,
    exportSessionProgress,
    resetSession,
    importProgressJson,
  } = useAppStore(useShallow((s) => ({
    setStep: s.setStep,
    viewMode: s.viewMode,
    setViewMode: s.setViewMode,
    sortMode: s.sortMode,
    setSortMode: s.setSortMode,
    focusedIndex: s.focusedIndex,
    setFocusedIndex: s.setFocusedIndex,
    isViewerOpen: s.isViewerOpen,
    openViewer: s.openViewer,
    closeViewer: s.closeViewer,
    getFilteredImages: s.getFilteredImages,
    images: s.images,
    selections: s.selections,
    currentDirectory: s.currentDirectory,
    activeFilter: s.activeFilter,
    getStats: s.getStats,
    exportSessionProgress: s.exportSessionProgress,
    resetSession: s.resetSession,
    importProgressJson: s.importProgressJson,
  })));

  // Suppress lint warnings — these are subscribed purely to trigger re-renders
  void images;
  void currentDirectory;
  void activeFilter;

  // Import JSON
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    try {
      const { matched, total } = await importProgressJson(file);
      setImportMsg(`Imported ${matched} / ${total} selections`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Import failed');
    }
    setTimeout(() => setImportMsg(null), 4000);
  }, [importProgressJson]);

  const filteredImages = getFilteredImages();
  const stats = getStats();

  // Sync focused image into view in single mode
  const singleViewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    singleViewRef.current?.focus();
  }, []);

  const handleGridSelect = useCallback(
    (index: number) => setFocusedIndex(index),
    [setFocusedIndex],
  );

  const handleGridDoubleClick = useCallback(
    (index: number) => openViewer(index),
    [openViewer],
  );

  const currentImage = filteredImages[focusedIndex];
  const progressPct = stats.progressPct;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-curator-bg text-curator-text">
      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-curator-border bg-curator-surface shrink-0">
        {/* Home button */}
        <button
          onClick={() => setStep('folder-selection')}
          title="Go to home"
          className="btn-icon shrink-0 text-curator-muted hover:text-curator-text"
        >
          <Home size={16} />
        </button>

        {/* Breadcrumb */}
        <div className="flex-1 min-w-0">
          <Breadcrumb />
        </div>

        {/* Progress bar */}
        <div className="hidden md:flex items-center gap-2 text-xs text-curator-muted shrink-0">
          <div className="w-24 h-1.5 bg-curator-panel rounded-full overflow-hidden">
            <div
              className="h-full bg-curator-accent transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="tabular-nums">{progressPct}%</span>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-curator-panel rounded-lg p-0.5 border border-curator-border shrink-0">
          <button
            onClick={() => setViewMode('single')}
            title="Single view (G)"
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'single'
                ? 'bg-curator-accent text-white'
                : 'text-curator-muted hover:text-curator-text',
            )}
          >
            <Square size={16} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            title="Grid view (G)"
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'grid'
                ? 'bg-curator-accent text-white'
                : 'text-curator-muted hover:text-curator-text',
            )}
          >
            <LayoutGrid size={16} />
          </button>
        </div>

        {/* Filter tabs */}
        <FilterTabs />

        {/* Sort selector */}
        <SortSelector sortMode={sortMode} setSortMode={setSortMode} />

        {/* Export + save progress + import + new session */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setStep('export')}
            className="btn-primary text-sm px-3 py-1.5"
          >
            Export
          </button>
          <button
            onClick={exportSessionProgress}
            title="Save progress as JSON"
            className="btn-secondary text-sm px-2 py-1.5"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            title="Import progress from JSON"
            className="btn-secondary text-sm px-2 py-1.5"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={resetSession}
            title="Start over"
            className="btn-secondary text-sm px-2 py-1.5"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Hidden file input for JSON import */}
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </header>

      {/* Import feedback banner */}
      {importMsg && (
        <div className="px-4 py-2 text-xs text-center bg-curator-accent/10 border-b border-curator-accent/20 text-curator-accent shrink-0">
          {importMsg}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <DirectorySidebar className="hidden md:flex w-56 shrink-0" />

        {/* Content */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0">
          {filteredImages.length === 0 ? (
            <EmptyState />
          ) : viewMode === 'single' ? (
            <SingleView image={currentImage ?? null} />
          ) : (
            <VirtualizedGallery
              images={filteredImages}
              selections={selections}
              focusedIndex={focusedIndex}
              onSelect={handleGridSelect}
              onDoubleClick={handleGridDoubleClick}
              containerClassName="flex-1 min-h-0"
            />
          )}

          {/* Action bar */}
          <ActionBar />
        </main>
      </div>

      {/* ── Full-screen zoom viewer ────────────────────────────────────────── */}
      {isViewerOpen && (
        <ImageViewer
          images={filteredImages}
          selections={selections}
          startIndex={focusedIndex}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}

// ─── Single image view ────────────────────────────────────────────────────────

function SingleView({ image }: { image: ImageFile | null }) {
  const url = useObjectUrl(image?.handle ?? null);
  const { openViewer, focusedIndex, selections } = useAppStore(useShallow((s) => ({
    openViewer: s.openViewer,
    focusedIndex: s.focusedIndex,
    selections: s.selections,
  })));

  const selection: SelectionState = image
    ? (selections.get(image.id) ?? 'undecided')
    : 'undecided';

  return (
    <div className="flex-1 flex items-center justify-center bg-curator-bg relative min-h-0 overflow-hidden">
      {/* Selection backdrop glow */}
      {selection === 'taken' && (
        <div className="absolute inset-0 border-4 border-green-500/30 pointer-events-none z-10" />
      )}
      {selection === 'dropped' && (
        <div className="absolute inset-0 border-4 border-red-500/30 pointer-events-none z-10" />
      )}

      {url ? (
        <img
          src={url}
          alt={image?.filename}
          onClick={() => openViewer(focusedIndex)}
          className={cn(
            'max-h-full max-w-full object-contain cursor-zoom-in transition-opacity',
            'animate-fade-in',
          )}
          draggable={false}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-curator-muted">
          <div className="w-8 h-8 border-2 border-curator-muted/30 border-t-curator-muted rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {/* Filename overlay */}
      {image && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white/80 text-xs px-3 py-1 rounded-full backdrop-blur-sm pointer-events-none">
          {image.filename}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-curator-muted">
      <Image size={48} strokeWidth={1.5} className="opacity-30" />
      <p className="text-sm">No images match current filters</p>
    </div>
  );
}

// ─── Sort selector ────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortMode; label: string; icon: React.ReactNode }[] = [
  { value: 'name', label: 'Name', icon: <ArrowDownAZ size={13} /> },
  { value: 'date', label: 'Date', icon: <Clock size={13} /> },
  { value: 'size', label: 'Size', icon: <HardDrive size={13} /> },
];

function SortSelector({
  sortMode,
  setSortMode,
}: {
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
}) {
  return (
    <div className="flex bg-curator-panel rounded-lg p-0.5 border border-curator-border shrink-0">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setSortMode(opt.value)}
          title={`Sort by ${opt.label}`}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
            sortMode === opt.value
              ? 'bg-curator-accent text-white'
              : 'text-curator-muted hover:text-curator-text',
          )}
        >
          {opt.icon}
          <span className="hidden lg:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
