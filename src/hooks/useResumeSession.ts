/**
 * useResumeSession
 *
 * On mount, checks if a root directory handle was persisted in IndexedDB.
 * - If permission is already `granted`  → sets `permissionGranted: true` so
 *   the caller can auto-resume without a user gesture.
 * - If permission needs a browser prompt → sets resumeHandle only, so the
 *   caller can show a "Resume" button (user gesture required for the prompt).
 *
 * Returns `{ resumeHandle, isChecking, permissionGranted, clearResume }`.
 */
import { useState, useEffect } from 'react';
import { loadRootHandle, clearRootHandle } from '../services/database';
import { queryHandlePermission } from '../services/fileSystem';

interface UseResumeSessionResult {
  resumeHandle: FileSystemDirectoryHandle | null;
  isChecking: boolean;
  /** True when the OS already granted permission — no user gesture needed. */
  permissionGranted: boolean;
  clearResume: () => void;
}

export function useResumeSession(): UseResumeSessionResult {
  const [resumeHandle, setResumeHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const handle = await loadRootHandle();
        if (!handle || cancelled) return;

        const state = await queryHandlePermission(handle);
        if (cancelled) return;

        if (state === 'granted') {
          setResumeHandle(handle);
          setPermissionGranted(true);
        } else if (state === 'prompt') {
          setResumeHandle(handle);
          setPermissionGranted(false);
        }
        // If state === 'denied' we simply don't set anything
      } catch {
        // IndexedDB or handle access failed — silently ignore
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearResume = () => {
    setResumeHandle(null);
    setPermissionGranted(false);
    clearRootHandle();
  };

  return { resumeHandle, isChecking, permissionGranted, clearResume };
}
