/**
 * VirtualizedGallery
 *
 * Renders the image grid using @tanstack/react-virtual.
 * Only images within the viewport have object URLs created.
 * GalleryCell is memoized so only changed cells re-render.
 */
import { useRef, useMemo, useCallback, memo } from 'react';
import { Check, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImageFile, SelectionState } from '../../types';
import { useThumbnailUrl } from '../../hooks/useThumbnailUrl';
import { cn } from '../../utils/cn';

interface VirtualizedGalleryProps {
  images: ImageFile[];
  selections: Map<string, SelectionState>;
  focusedIndex: number;
  onSelect: (index: number) => void;
  onDoubleClick: (index: number) => void;
  containerClassName?: string;
}

const COLUMN_COUNT = 4;
const CELL_HEIGHT = 200; // px
const GAP = 8;

export function VirtualizedGallery({
  images,
  selections,
  focusedIndex,
  onSelect,
  onDoubleClick,
  containerClassName,
}: VirtualizedGalleryProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Group images into rows
  const rows = useMemo(() => {
    const result: ImageFile[][] = [];
    for (let i = 0; i < images.length; i += COLUMN_COUNT) {
      result.push(images.slice(i, i + COLUMN_COUNT));
    }
    return result;
  }, [images]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_HEIGHT + GAP,
    overscan: 2,
  });

  return (
    <div
      ref={parentRef}
      className={cn('overflow-y-auto', containerClassName)}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowImages = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: virtualRow.start,
                left: 0,
                right: 0,
                height: CELL_HEIGHT,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMN_COUNT}, 1fr)`,
                gap: GAP,
                padding: `0 ${GAP}px`,
              }}
            >
              {rowImages.map((img, colIdx) => {
                const absIndex = virtualRow.index * COLUMN_COUNT + colIdx;
                const selection = selections.get(img.id) ?? 'undecided';
                const isFocused = absIndex === focusedIndex;
                return (
                  <GalleryCell
                    key={img.id}
                    image={img}
                    selection={selection}
                    isFocused={isFocused}
                    absIndex={absIndex}
                    onSelect={onSelect}
                    onDoubleClick={onDoubleClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Individual gallery cell ──────────────────────────────────────────────────

interface GalleryCellProps {
  image: ImageFile;
  selection: SelectionState;
  isFocused: boolean;
  absIndex: number;
  onSelect: (i: number) => void;
  onDoubleClick: (i: number) => void;
}

const GalleryCell = memo(function GalleryCell({
  image,
  selection,
  isFocused,
  absIndex,
  onSelect,
  onDoubleClick,
}: GalleryCellProps) {
  const url = useThumbnailUrl(image.handle, image.id);

  const handleClick = useCallback(() => onSelect(absIndex), [onSelect, absIndex]);
  const handleDoubleClick = useCallback(() => onDoubleClick(absIndex), [onDoubleClick, absIndex]);

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden cursor-pointer transition-all border-2',
        'bg-curator-panel select-none',
        isFocused
          ? 'border-curator-accent ring-2 ring-curator-accent/40'
          : 'border-transparent hover:border-curator-border',
      )}
      style={{ contain: 'layout style paint' }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {url ? (
        <img
          src={url}
          alt={image.filename}
          width={CELL_HEIGHT}
          height={CELL_HEIGHT}
          className="w-full h-full object-cover"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-curator-muted/30 border-t-curator-muted rounded-full animate-spin" />
        </div>
      )}

      {/* Selection badge */}
      {selection !== 'undecided' && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-lg',
            selection === 'taken' ? 'bg-green-500' : 'bg-red-500',
          )}
        >
          {selection === 'taken' ? (
            <Check size={12} strokeWidth={3} />
          ) : (
            <X size={12} strokeWidth={3} />
          )}
        </div>
      )}

      {/* Filename on hover */}
      <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs px-2 py-1 truncate opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
        {image.filename}
      </div>
    </div>
  );
});
