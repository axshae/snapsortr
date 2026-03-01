/**
 * ImageViewer
 *
 * Full-screen zoom + pan viewer using yet-another-react-lightbox (YARL).
 *
 * Why YARL instead of react-photo-view:
 *  - react-photo-view requires a real `src` URL upfront to measure image
 *    dimensions before it can calculate zoom/pan math. Without a valid `src`
 *    it renders at 0×0 → black screen. YARL's Zoom plugin applies CSS
 *    transforms at the slide-container level, so it works perfectly with our
 *    lazy FSA blob-URL loader regardless of whether the image has loaded yet.
 *
 * Lazy loading:
 *  - Each slide uses `render.slide` to mount a <LazySlide> React component.
 *  - <LazySlide> calls useObjectUrl(handle) which reads the file on demand via
 *    the File System Access API and creates a blob URL.
 *  - YARL renders at most 3 slides at a time (current ± preload:1), so memory
 *    is bounded regardless of collection size.
 *  - Blob URLs are revoked automatically when the component unmounts.
 */
import { useMemo, useState, useCallback } from 'react';
import Lightbox, { SlideImage } from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';

import { ImageFile, SelectionState } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { cn } from '../../utils/cn';

// ─── Extend YARL's SlideImage to carry FSA metadata ──────────────────────────
// Module augmentation keeps full type safety — these extra fields are available
// on every SlideImage passed through render.slide / render.slideFooter.
declare module 'yet-another-react-lightbox' {
  interface SlideImage {
    /** FSA file handle — used by LazySlide to create a blob URL on demand */
    handle: FileSystemFileHandle;
    /** Internal image ID — used to look up / update selection state */
    imageId: string;
    /** Relative path — forwarded to setSelection */
    imagePath: string;
    /** Display filename shown in the footer toolbar */
    imageFilename: string;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImageViewerProps {
  images: ImageFile[];
  selections: Map<string, SelectionState>;
  startIndex: number;
  onClose: () => void;
}

// ─── Main lightbox ────────────────────────────────────────────────────────────

export function ImageViewer({
  images,
  selections,
  startIndex,
  onClose,
}: ImageViewerProps) {
  const { setFocusedIndex, setSelection } = useAppStore(
    useShallow((s) => ({
      setFocusedIndex: s.setFocusedIndex,
      setSelection: s.setSelection,
    })),
  );

  // Track current slide index locally so toolbar buttons always reflect the
  // active image — toolbar.buttons are static React nodes, not per-slide.
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const currentImage = images[currentIndex];
  const currentSelection = currentImage
    ? (selections.get(currentImage.id) ?? 'undecided')
    : 'undecided';

  // ── Zoom dimension fix ──────────────────────────────────────────────────
  // YARL's Zoom plugin uses slide.width / slide.height to calculate maxZoom.
  // Since we use render.slide (bypassing YARL's ImageSlide), those values are
  // never auto-populated. We capture naturalWidth/naturalHeight from the img
  // onLoad event in LazySlide and feed them back here so zoom works properly.
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(() => new Map());
  const handleDimensions = useCallback((id: string, w: number, h: number) => {
    setDims((prev) => {
      if (prev.get(id)?.width === w && prev.get(id)?.height === h) return prev;
      const next = new Map(prev);
      next.set(id, { width: w, height: h });
      return next;
    });
  }, []);

  // `src` is a 1×1 transparent GIF placeholder — satisfies YARL's type; our
  // render.slide overrides the actual rendering. width/height are added once
  // known so the Zoom plugin can compute the correct maxZoom.
  const slides: SlideImage[] = useMemo(
    () =>
      images.map((img) => {
        const d = dims.get(img.id);
        return {
          src: PLACEHOLDER,
          ...(d ?? {}),
          handle: img.handle,
          imageId: img.id,
          imagePath: img.path,
          imageFilename: img.filename,
        };
      }),
    [images, dims],
  );

  return (
    <Lightbox
      open
      close={onClose}
      slides={slides}
      index={startIndex}
      on={{
        view: ({ index }) => {
          setCurrentIndex(index);
          setFocusedIndex(index);
        },
      }}
      plugins={[Zoom]}
      zoom={{
        maxZoomPixelRatio: 5,
        zoomInMultiplier: 2,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
        doubleClickMaxStops: 2,
        scrollToZoom: true,
      }}
      render={{
        slide: ({ slide }) => {
          const s = slide as SlideImage;
          return (
            <LazySlide
              handle={s.handle}
              filename={s.imageFilename}
              imageId={s.imageId}
              onDimensionsReady={handleDimensions}
            />
          );
        },
        // Filename centred below the image using YARL's dedicated footer slot
        slideFooter: ({ slide }) => (
          <div className="text-center pb-3 pt-1 pointer-events-none">
            <span className="text-white/40 text-xs">
              {(slide as SlideImage).imageFilename}
            </span>
          </div>
        ),
      }}
      toolbar={{
        // Zoom plugin prepends its own zoom-in / zoom-out buttons automatically.
        // We add Take + Drop before the close button.
        buttons: [
          currentImage && (
            <button
              key="take"
              onClick={() =>
                setSelection(currentImage.id, currentImage.path, 'taken')
              }
              className={cn(
                'px-3 py-1 rounded text-xs font-semibold border transition-colors mr-1',
                currentSelection === 'taken'
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-green-500/30 hover:border-green-500/50',
              )}
            >
              Take
            </button>
          ),
          currentImage && (
            <button
              key="drop"
              onClick={() =>
                setSelection(currentImage.id, currentImage.path, 'dropped')
              }
              className={cn(
                'px-3 py-1 rounded text-xs font-semibold border transition-colors mr-3',
                currentSelection === 'dropped'
                  ? 'bg-red-500 border-red-500 text-white'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-red-500/30 hover:border-red-500/50',
              )}
            >
              Drop
            </button>
          ),
          'close',
        ],
      }}
      styles={{
        container: { backgroundColor: 'rgba(10, 10, 14, 0.96)' },
      }}
      carousel={{ preload: 1 }}
    />
  );
}

// ─── 1×1 transparent GIF ─────────────────────────────────────────────────────
const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ─── Lazy slide: resolves FSA handle → blob URL on mount ─────────────────────

function LazySlide({
  handle,
  filename,
  imageId,
  onDimensionsReady,
}: {
  handle: FileSystemFileHandle;
  filename: string;
  imageId: string;
  onDimensionsReady: (id: string, w: number, h: number) => void;
}) {
  const url = useObjectUrl(handle);

  if (!url) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={filename}
      draggable={false}
      // Report natural dimensions to the parent so the Zoom plugin can
      // compute the correct maxZoom (it reads slide.width / slide.height).
      onLoad={(e) => {
        const img = e.currentTarget;
        onDimensionsReady(imageId, img.naturalWidth, img.naturalHeight);
      }}
      style={{
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        userSelect: 'none',
      }}
    />
  );
}
