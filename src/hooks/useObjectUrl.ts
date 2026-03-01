/**
 * useObjectUrl
 *
 * Creates a temporary blob/object URL for a FileSystemFileHandle.
 * - Keeps the previous URL visible until the new one is ready (no flickering).
 * - Revokes old URLs only after the new one has been set.
 * - Returns isLoading=true while the decode/read is in flight so callers can
 *   render a loading indicator on top of the previous image (important for
 *   slow-decode formats like HEIC).
 */
import { useState, useEffect, useRef } from 'react';
import { getDisplayableBlob, needsDecode } from '../utils/decodeImage';

/**
 * @param id  Optional image id (pathToId result). When provided, the decoded
 *            blob for HEIC/TIFF files is read from the session cache so the
 *            expensive decode step only runs once per image per session.
 */
export function useObjectUrl(
  handle: FileSystemFileHandle | null | undefined,
  id?: string,
): { url: string | null; isLoading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
      setIsLoading(false);
      return;
    }

    // Signal loading immediately so callers can show an indicator.
    setIsLoading(true);
    let cancelled = false;

    handle
      .getFile()
      .then(async (file) => {
        if (cancelled) return;
        // Decode HEIC/HEIF/TIFF/SVG to a browser-renderable blob before
        // creating the object URL so the <img> can actually display it.
        const blob = needsDecode(handle.name)
          ? await getDisplayableBlob(file, id)
          : file;
        if (cancelled) return;
        const newUrl = URL.createObjectURL(blob);
        // Revoke the old URL only after the new one is ready
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }
        prevUrlRef.current = newUrl;
        setUrl(newUrl);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
          setIsLoading(false);
        }
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

  return { url, isLoading };
}
