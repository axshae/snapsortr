/**
 * File System Access API wrapper.
 *
 * Provides:
 *   - pickDirectory()   – prompt user for a directory
 *   - scanDirectory()   – async generator yielding ImageFile metadata
 *   - requestHandlePermission() – verify/re-grant permission after reload
 */
import { ImageFile } from '../types';
import { isImageFile, pathToId, getDirectory } from '../utils/imageUtils';

// ─── Directory picker ─────────────────────────────────────────────────────────

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'The File System Access API is not supported in this browser. Please use Chrome or Edge.',
    );
  }
  return (window as Window).showDirectoryPicker({ mode: 'read' });
}

// ─── Permission handling ──────────────────────────────────────────────────────

export async function requestHandlePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    const state = await (handle as FileSystemHandle).requestPermission({ mode: 'read' });
    return state === 'granted';
  } catch {
    return false;
  }
}

export async function queryHandlePermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  return (handle as FileSystemHandle).queryPermission({ mode: 'read' });
}

// ─── Recursive directory scanner ─────────────────────────────────────────────

/**
 * Bounded concurrency helper: runs all `tasks` in parallel but keeps at most
 * `limit` promises in flight at a time. Returns results in completion order
 * (order is non-deterministic — callers must sort afterwards if needed).
 */
async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift()!;
      results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Scans `dirHandle` recursively and returns a flat list of every image found.
 * Does NOT read file contents, create object URLs, or load pixels — only reads
 * file.size and file.lastModified from cheap OS metadata.
 *
 * Parallelism strategy:
 *  - Within a single directory: getFile() calls are fanned out in parallel
 *    (up to FILE_CONCURRENCY at a time).
 *  - Subdirectory traversal: all sibling subdirectories are scanned in
 *    parallel via Promise.all, which collapses serial depth into wall-clock
 *    time proportional to the deepest branch only.
 */
const FILE_CONCURRENCY = 16;

export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  relativePath = '',
  onProgress?: (count: number) => void,
  _counter: { value: number } = { value: 0 },
): Promise<ImageFile[]> {
  const fileEntries: { name: string; handle: FileSystemFileHandle }[] = [];
  const subDirEntries: { name: string; handle: FileSystemDirectoryHandle }[] = [];

  // Collect all entries in this directory (streaming API — must stay serial)
  for await (const [name, handle] of dirHandle.entries()) {
    const entryPath = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === 'directory') {
      subDirEntries.push({ name: entryPath, handle: handle as FileSystemDirectoryHandle });
    } else if (handle.kind === 'file' && isImageFile(name)) {
      fileEntries.push({ name, handle: handle as FileSystemFileHandle });
    }
  }

  // Fan out getFile() metadata reads across all image files in this directory
  const fileTasks = fileEntries.map(({ name, handle }) => async (): Promise<ImageFile | null> => {
    const entryPath = relativePath ? `${relativePath}/${name}` : name;
    try {
      const file = await handle.getFile();      _counter.value++;
      onProgress?.(_counter.value);      return {
        id: pathToId(entryPath),
        path: entryPath,
        filename: name,
        directory: getDirectory(entryPath),
        handle,
        size: file.size,
        lastModified: file.lastModified,
      };
    } catch {
      return null; // Skip unreadable files
    }
  });

  const fileResults = await withConcurrencyLimit(fileTasks, FILE_CONCURRENCY);
  const images: ImageFile[] = fileResults.filter((img): img is ImageFile => img !== null);

  // Recurse into all subdirectories in parallel
  if (subDirEntries.length > 0) {
    const subResults = await Promise.all(
      subDirEntries.map(({ name, handle }) => scanDirectory(handle, name, onProgress, _counter)),
    );
    for (const subImages of subResults) {
      images.push(...subImages);
    }
  }

  return images;
}

// ─── Object URL helpers ───────────────────────────────────────────────────────

/** Create a temporary object URL for a file handle. Caller must revoke it. */
export async function createObjectUrl(
  handle: FileSystemFileHandle,
): Promise<string> {
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
}
