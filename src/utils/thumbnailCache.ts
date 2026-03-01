/**
 * thumbnailCache
 *
 * Generates and caches small JPEG thumbnails for FileSystemFileHandles using
 * createImageBitmap + OffscreenCanvas — both work off the main-thread GPU/render
 * process in Chromium and avoid decoding full-resolution images into the page heap.
 *
 * Design:
 *  - Module-level Map caches blob: URLs for the lifetime of the session.
 *  - In-flight Map deduplicates concurrent requests for the same image (e.g.
 *    two cells appearing simultaneously after a fast scroll).
 *  - A semaphore limits concurrent decodes so the browser is never asked to
 *    expand 20+ × 40 MP images at once.
 *  - HEIC / undecodable files fall back to a full-res object URL (same as the
 *    old behaviour) so they still display in the grid.
 *  - clearThumbnailCache() revokes all URLs and clears both Maps; call it from
 *    resetSession() to avoid stale data and free memory.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Long-edge pixel limit for generated thumbnails. At 4 cols in a ~1400px
 *  window each cell is ~280 px wide; 600 px gives crisp 2× retina coverage. */
const THUMB_MAX_DIM = 600;

/** Max concurrent createImageBitmap + OffscreenCanvas operations. */
const MAX_CONCURRENT = 4;

/** JPEG quality for generated thumbnails (0–1). */
const THUMB_QUALITY = 0.85;

// ─── Module-level caches ──────────────────────────────────────────────────────

/** Completed thumbnails: imageId → blob URL */
const cache = new Map<string, string>();

/** In-flight generations: imageId → pending Promise<string> */
const inflight = new Map<string, Promise<string>>();

// ─── Semaphore ────────────────────────────────────────────────────────────────

let activeCount = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next(); // hand the slot directly to the next waiter
  } else {
    activeCount--;
  }
}

// ─── Core generator ───────────────────────────────────────────────────────────

async function generate(
  id: string,
  handle: FileSystemFileHandle,
): Promise<string> {
  await acquireSlot();

  try {
    const file = await handle.getFile();

    let url: string;

    try {
      // Decode the image. In Chrome, createImageBitmap runs through the GPU
      // process; for JPEG it uses a sub-sampled DCT path for large images.
      const bitmap = await createImageBitmap(file);

      // Scale to thumbnail dimensions
      const { width: bw, height: bh } = bitmap;
      const scale = Math.min(1, THUMB_MAX_DIM / Math.max(bw, bh));
      const tw = Math.round(bw * scale);
      const th = Math.round(bh * scale);

      // Draw onto an OffscreenCanvas
      const canvas = new OffscreenCanvas(tw, th);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, tw, th);

      // Free GPU memory immediately — don't wait for GC
      bitmap.close();

      // Encode as JPEG blob
      const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: THUMB_QUALITY,
      });

      url = URL.createObjectURL(blob);
    } catch {
      // createImageBitmap can't decode HEIC, TIFF on some platforms, corrupted
      // files, etc. Fall back to a full-res URL — same as the previous behaviour.
      const file2 = await handle.getFile();
      url = URL.createObjectURL(file2);
    }

    cache.set(id, url);
    return url;
  } finally {
    releaseSlot();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a blob URL for a thumbnail of the image identified by `id`.
 *
 * - If the thumbnail is already cached, the URL is returned synchronously via
 *   a resolved Promise — no re-render occurs.
 * - Concurrent calls for the same `id` share a single in-flight Promise.
 */
export function generateThumbnail(
  id: string,
  handle: FileSystemFileHandle,
): Promise<string> {
  // Synchronous cache hit — return immediately
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);

  // Dedup in-flight
  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = generate(id, handle).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, promise);
  return promise;
}

/**
 * If the thumbnail for `id` is already cached, return its URL synchronously.
 * Otherwise return null (caller should call generateThumbnail and await).
 */
export function getCachedThumbnail(id: string): string | null {
  return cache.get(id) ?? null;
}

/**
 * Revoke all cached blob URLs and clear both Maps.
 * Call this when starting a new session to free memory.
 */
export function clearThumbnailCache(): void {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
  inflight.clear();
  // Drain any waiting queue entries so stale generate() calls get a slot
  // and resolve quickly (they'll find the handle might be gone, but won't hang)
  while (waitQueue.length > 0 && activeCount < MAX_CONCURRENT) {
    activeCount++;
    const next = waitQueue.shift();
    next?.();
  }
}
