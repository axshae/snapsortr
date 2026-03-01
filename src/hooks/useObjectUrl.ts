/**
 * useObjectUrl
 *
 * Creates a temporary blob/object URL for a FileSystemFileHandle.
 * - Keeps the previous URL visible until the new one is ready (no flickering).
 * - Revokes old URLs only after the new one has been set.
 * Returns null only on the very first load (no prior URL exists yet).
 */
import { useState, useEffect, useRef } from 'react';

export function useObjectUrl(
  handle: FileSystemFileHandle | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // Track the last successfully created URL so we can revoke it after replacement
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!handle) {
      // Revoke and clear
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setUrl(null);
      return;
    }

    let cancelled = false;

    handle
      .getFile()
      .then((file) => {
        if (cancelled) return;
        const newUrl = URL.createObjectURL(file);
        // Revoke the old URL only after the new one is ready
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }
        prevUrlRef.current = newUrl;
        setUrl(newUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, []);

  return url;
}
