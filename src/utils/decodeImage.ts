/**
 * decodeImage
 *
 * Format-specific pre-processing so every image type returns a Blob that
 * browsers can natively display (and createImageBitmap can decode).
 *
 * Formats handled:
 *   HEIC / HEIF  → native OS codec first (macOS Chrome 104+ supports HEIC
 *                  natively via ImageIO — zero-JS path); heic2any fallback
 *                  for platforms without native support.
 *   TIFF / TIF   → PNG via utif (baseline & multi-page TIFF decoder)
 *   SVG          → re-wrapped with correct image/svg+xml MIME type
 *   All others   → returned as-is
 *
 * Performance:
 *   - Native HEIC check fires once per session; result is memoised. All
 *     subsequent HEIC files skip the async heic2any path entirely on
 *     supported platforms.
 *   - Decoded blobs are cached by image-id for the lifetime of the session
 *     (cleared in resetSession). This means thumbnail generation and the
 *     full-screen viewer share one decode — heic2any/utif run at most once
 *     per image per session.
 */

import heic2any from 'heic2any';

// utif ships no TypeScript types — declare the module to suppress the error.
declare module 'utif' {
  export function decode(buf: ArrayBuffer): { width: number; height: number; [k: string]: unknown }[];
  export function decodeImage(buf: ArrayBuffer, ifd: { width: number; height: number; [k: string]: unknown }): void;
  export function toRGBA8(ifd: { width: number; height: number; [k: string]: unknown }): Uint8Array;
}

// ─── Session-level decoded blob cache ────────────────────────────────────────
// Key: image id (pathToId result).  Value: displayable Blob.
// Avoids re-running heic2any / utif when the same file is rendered as a
// thumbnail AND opened in the full-screen viewer in the same session.
const decodedBlobCache = new Map<string, Blob>();

export function clearDecodedBlobCache(): void {
  decodedBlobCache.clear();
}

// ─── Native HEIC support probe ────────────────────────────────────────────────
// macOS Chrome 104+ decodes HEIC via the OS ImageIO framework — createImageBitmap
// succeeds without any JS decoder.  We test once and memoise the result.
let nativeHeicSupported: boolean | null = null;

async function probeNativeHeic(file: File): Promise<boolean> {
  if (nativeHeicSupported !== null) return nativeHeicSupported;
  try {
    // createImageBitmap throws synchronously (no GPU work) if the codec is
    // absent, so this is cheap enough to run as a one-time probe.
    const bmp = await createImageBitmap(file);
    bmp.close();
    nativeHeicSupported = true;
  } catch {
    nativeHeicSupported = false;
  }
  return nativeHeicSupported;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a Blob that Chrome can display in an <img> or decode via
 * createImageBitmap.
 *
 * @param file  The raw File obtained from FileSystemFileHandle.getFile().
 * @param id    Optional image id — when supplied, the decoded blob is cached
 *              so repeated calls (thumbnail + viewer) skip re-decoding.
 */
export async function getDisplayableBlob(file: File, id?: string): Promise<Blob> {
  const ext = getExt(file.name);

  // ── HEIC / HEIF ────────────────────────────────────────────────────────────
  if (ext === 'heic' || ext === 'heif') {
    if (id) {
      const hit = decodedBlobCache.get(id);
      if (hit) return hit;
    }

    // Fast path: macOS Chrome supports HEIC natively.
    const native = await probeNativeHeic(file);
    if (native) {
      // Ensure explicit MIME type so blob: URLs render in <img> correctly.
      const blob: Blob = file.type
        ? file
        : new Blob([await file.arrayBuffer()], { type: 'image/heic' });
      if (id) decodedBlobCache.set(id, blob);
      return blob;
    }

    // Slow path: heic2any pure-JS decoder (non-macOS platforms).
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    if (id) decodedBlobCache.set(id, blob);
    return blob;
  }

  // ── TIFF / TIF ─────────────────────────────────────────────────────────────
  if (ext === 'tiff' || ext === 'tif') {
    if (id) {
      const hit = decodedBlobCache.get(id);
      if (hit) return hit;
    }
    const blob = await decodeTiff(file);
    if (id) decodedBlobCache.set(id, blob);
    return blob;
  }

  // ── SVG ────────────────────────────────────────────────────────────────────
  if (ext === 'svg') {
    // blob: URLs for SVG require an explicit image/svg+xml MIME type in Chrome.
    if (file.type === 'image/svg+xml') return file;
    const buf = await file.arrayBuffer();
    return new Blob([buf], { type: 'image/svg+xml' });
  }

  return file;
}

/** True for formats that need pre-processing before URL / bitmap creation. */
export function needsDecode(name: string): boolean {
  const ext = getExt(name);
  return ext === 'heic' || ext === 'heif' || ext === 'tiff' || ext === 'tif' || ext === 'svg';
}

// ─── TIFF decoder ─────────────────────────────────────────────────────────────

async function decodeTiff(file: File): Promise<Blob> {
  const UTIF = await import('utif');
  const buf = await file.arrayBuffer();
  type IFD = { width: number; height: number; [k: string]: unknown };
  const ifds: IFD[] = UTIF.decode(buf);
  if (!ifds || ifds.length === 0) throw new Error('No TIFF pages found');

  // Decode the first page
  UTIF.decodeImage(buf, ifds[0]);
  const rgba: Uint8Array = UTIF.toRGBA8(ifds[0]);
  const w: number = ifds[0].width;
  const h: number = ifds[0].height;

  // Paint into a canvas and export as PNG
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode decoded TIFF'))),
      'image/png',
    );
  });
}
