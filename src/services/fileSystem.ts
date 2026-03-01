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
 * Lazily yields ImageFile metadata for every image found under `dirHandle`.
 * Does NOT read file contents, create object URLs, or load pixels.
 * Only reads file.size and file.lastModified from the File metadata.
 */
export async function* scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  relativePath = '',
): AsyncGenerator<ImageFile> {
  for await (const [name, handle] of dirHandle.entries()) {
    const entryPath = relativePath ? `${relativePath}/${name}` : name;

    if (handle.kind === 'directory') {
      yield* scanDirectory(handle as FileSystemDirectoryHandle, entryPath);
    } else if (handle.kind === 'file' && isImageFile(name)) {
      // Read only size + lastModified (cheap metadata call)
      let size = 0;
      let lastModified = 0;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        size = file.size;
        lastModified = file.lastModified;
      } catch {
        // Skip unreadable files
        continue;
      }

      const imageFile: ImageFile = {
        id: pathToId(entryPath),
        path: entryPath,
        filename: name,
        directory: getDirectory(entryPath),
        handle: handle as FileSystemFileHandle,
        size,
        lastModified,
      };

      yield imageFile;
    }
  }
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
