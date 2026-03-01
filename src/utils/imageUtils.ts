import { ImageFile, DirectoryNode } from '../types';

/** Supported image MIME types / extensions */
const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',
  'bmp', 'tiff', 'tif', 'heic', 'heif', 'svg',
]);

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

/** Derive a stable ID from the file's relative path */
export function pathToId(path: string): string {
  return encodeURIComponent(path);
}

/** Format bytes → human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Extract directory portion of a relative path */
export function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? '' : path.slice(0, lastSlash);
}

/** Build a tree of DirectoryNode from a flat array of ImageFile metadata. */
export function buildTreeFromImages(
  images: ImageFile[],
  rootName: string,
): DirectoryNode {
  const root: DirectoryNode = {
    name: rootName,
    path: '',
    children: [],
    imageCount: 0,
    totalImageCount: 0,
  };

  for (const image of images) {
    const parts = image.directory.split('/').filter(Boolean);
    let node = root;
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let child = node.children.find((c) => c.path === currentPath);
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          children: [],
          imageCount: 0,
          totalImageCount: 0,
        };
        node.children.push(child);
        // Keep children sorted alphabetically
        node.children.sort((a, b) => a.name.localeCompare(b.name));
      }
      node = child;
    }

    node.imageCount++;
  }

  // Compute totalImageCount bottom-up
  function calcTotal(node: DirectoryNode): number {
    node.totalImageCount =
      node.imageCount +
      node.children.reduce((sum, c) => sum + calcTotal(c), 0);
    return node.totalImageCount;
  }
  calcTotal(root);

  return root;
}

/** Return a flat, ordered list of all ancestor path segments for breadcrumbs. */
export function getAncestors(
  path: string,
  rootName: string,
): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [
    { name: rootName, path: '' },
  ];
  if (!path) return result;

  const parts = path.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    result.push({ name: part, path: current });
  }
  return result;
}

/** Truncate a filename for display, preserving the extension */
export function truncateFilename(name: string, maxLen = 24): string {
  if (name.length <= maxLen) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot !== -1 ? name.slice(dot) : '';
  const base = dot !== -1 ? name.slice(0, dot) : name;
  return `${base.slice(0, maxLen - ext.length - 1)}…${ext}`;
}
