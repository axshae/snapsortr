// ─── Core domain types ──────────────────────────────────────────────────────

export type SelectionState = 'taken' | 'dropped' | 'undecided';

export type AppStep = 'folder-selection' | 'image-review' | 'export';

export type FilterTab = 'all' | 'taken' | 'dropped' | 'undecided';

export type ViewMode = 'single' | 'grid';

// ─── Image metadata ─────────────────────────────────────────────────────────

/**
 * Lightweight metadata object for one image file.
 * Never stores the blob or object URL.
 * `handle` is in-memory only and is not persisted.
 */
export interface ImageFile {
  /** Stable ID: relative path from root (url-encoded). */
  id: string;
  /** Full relative path from the root directory, e.g. "Trips/Paris/img001.jpg" */
  path: string;
  /** Filename only, e.g. "img001.jpg" */
  filename: string;
  /** Parent directory relative path, e.g. "Trips/Paris" or "" for root */
  directory: string;
  /** File System Access API handle — in-memory only */
  handle: FileSystemFileHandle;
  /** File size in bytes */
  size: number;
  /** Unix timestamp (ms) */
  lastModified: number;
}

// ─── Directory tree ──────────────────────────────────────────────────────────

export interface DirectoryNode {
  name: string;
  /** Relative path from root — empty string for the root itself */
  path: string;
  children: DirectoryNode[];
  /** Images directly in this directory (not counting children) */
  imageCount: number;
  /** Images in this directory + all descendants */
  totalImageCount: number;
}

// ─── Persisted state (IndexedDB / selection map) ─────────────────────────────

export interface PersistedSelection {
  /** Same as ImageFile.id */
  path: string;
  selection: SelectionState;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export type ExportTarget = 'taken' | 'dropped' | 'undecided' | 'all';

export interface ExportOptions {
  target: ExportTarget;
  /** If true, recreate the original sub-directory structure inside the ZIP / target folder */
  preserveStructure: boolean;
  method: 'zip' | 'filesystem';
  /** Only used when target === 'custom' — explicit image IDs */
  customIds?: string[];
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface CurationStats {
  total: number;
  taken: number;
  dropped: number;
  undecided: number;
  /** Percentage reviewed (taken + dropped) */
  progressPct: number;
}

// ─── Sort ────────────────────────────────────────────────────────────────────

export type SortMode = 'name' | 'date' | 'size';

// ─── Session history ─────────────────────────────────────────────────────────

export interface SessionRecord {
  /** Uses folderName as the stable unique ID (same folder → same session). */
  id: string;
  folderName: string;
  startedAt: number;        // Unix ms
  lastAccessedAt: number;   // Unix ms
  totalImages: number;
  taken: number;
  dropped: number;
  undecided: number;
}

// ─── Import result ────────────────────────────────────────────────────────────

export interface ImportResult {
  /** Number of selections successfully matched and applied. */
  matched: number;
  /** Total non-undecided entries in the imported file. */
  total: number;
}
