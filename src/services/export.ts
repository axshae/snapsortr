/**
 * Export service.
 *
 * Supports two export methods:
 *   1. ZIP download  — works everywhere, uses JSZip
 *   2. File System   — saves directly to a user-chosen directory via FSA API
 *
 * Directory structure is always preserved when `preserveStructure` is true.
 */
import JSZip from 'jszip';
import { ImageFile, ExportOptions } from '../types';

// ─── Main export entry point ──────────────────────────────────────────────────

export async function exportImages(
  images: ImageFile[],
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (options.method === 'filesystem' && 'showDirectoryPicker' in window) {
    await exportToFilesystem(images, options, onProgress);
  } else {
    await exportAsZip(images, options, onProgress);
  }
}

// ─── ZIP export ───────────────────────────────────────────────────────────────

async function exportAsZip(
  images: ImageFile[],
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const total = images.length;
  let done = 0;

  for (const img of images) {
    let file: File;
    try {
      file = await img.handle.getFile();
    } catch {
      done++;
      onProgress?.(done, total);
      continue;
    }

    const destPath = options.preserveStructure ? img.path : img.filename;
    zip.file(destPath, file);

    done++;
    onProgress?.(done, total);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  triggerDownload(blob, `snapsortr-export.zip`);
}

// ─── File System Access API export ───────────────────────────────────────────

async function exportToFilesystem(
  images: ImageFile[],
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const rootDirHandle = await (window as Window).showDirectoryPicker({ mode: 'readwrite' });
  const total = images.length;
  let done = 0;

  for (const img of images) {
    let file: File;
    try {
      file = await img.handle.getFile();
    } catch {
      done++;
      onProgress?.(done, total);
      continue;
    }

    // Ensure sub-directories exist
    const dirHandle = options.preserveStructure
      ? await ensureDirectory(rootDirHandle, img.directory)
      : rootDirHandle;

    const writable = await (
      await dirHandle.getFileHandle(img.filename, { create: true })
    ).createWritable();

    await writable.write(file);
    await writable.close();

    done++;
    onProgress?.(done, total);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively creates and returns a nested directory handle.
 * e.g. "Trips/Paris/2024" creates three levels under `root`.
 */
async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  if (!relativePath) return root;
  const parts = relativePath.split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
