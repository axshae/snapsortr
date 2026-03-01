/**
 * useThumbnailUrl
 *
 * Returns a cached thumbnail blob URL for a FileSystemFileHandle.
 *
 * - If the thumbnail is already in the module-level cache, it is returned on
 *   the first render without any async work or state update (no re-render cost).
 * - On a cache miss, generation is kicked off and the component re-renders once
 *   when the thumbnail is ready.
 * - Unmount/handle-change cancellation is handled via a flag so stale setState
 *   calls are silently dropped.
 */
import { useState, useEffect } from 'react';
import {
  generateThumbnail,
  getCachedThumbnail,
} from '../utils/thumbnailCache';

export function useThumbnailUrl(
  handle: FileSystemFileHandle | null | undefined,
  id: string,
): string | null {
  // Synchronous initialiser: if the thumbnail is already in the cache when the
  // component mounts, we set the URL immediately — no setState, no re-render.
  const [url, setUrl] = useState<string | null>(() => {
    if (!handle) return null;
    return getCachedThumbnail(id);
  });

  useEffect(() => {
    if (!handle) {
      setUrl(null);
      return;
    }

    // Check cache synchronously; if still warm (e.g. cell re-mounted after
    // scrolling back) skip the async path entirely.
    const cached = getCachedThumbnail(id);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;

    generateThumbnail(id, handle).then((thumbUrl) => {
      if (!cancelled) setUrl(thumbUrl);
    });

    return () => {
      cancelled = true;
    };
  // `handle` identity changes when the user opens a different folder.
  // `id` is derived from the file path and changes with `handle`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, id]);

  return url;
}
