/**
 * Central Zustand store for Image Curator.
 *
 * Performance design:
 *  - `images` is an immutable array (metadata + handles only, no blobs).
 *  - `selections` is a separate Map<id, SelectionState> for O(1) reads/writes
 *    without re-spreading the entire images array on every selection change.
 *  - All derived data (filtered images, stats) is computed via selector
 *    functions that components subscribe to precisely.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  AppStep,
  CurationStats,
  DirectoryNode,
  FilterTab,
  ImageFile,
  SelectionState,
  SessionRecord,
  SortMode,
  ViewMode,
} from '../types';
import { scanDirectory } from '../services/fileSystem';
import * as db from '../services/database';
import { buildTreeFromImages, pathToId } from '../utils/imageUtils';
import { clearThumbnailCache } from '../utils/thumbnailCache';

interface AppState {
  // ── Wizard ─────────────────────────────────────────────────────────────────
  step: AppStep;

  // ── Session data ───────────────────────────────────────────────────────────
  /** All scanned image metadata. Handles are in-memory, never serialised. */
  images: ImageFile[];
  /** Separate O(1) selection lookup: imageId → state */
  selections: Map<string, SelectionState>;
  /** Directory tree built from image paths */
  directoryTree: DirectoryNode | null;
  /** Root directory handle (in-memory, re-requested on reload) */
  rootHandle: FileSystemDirectoryHandle | null;
  /** Display name of the root directory */
  rootName: string;
  /** Active session ID (= folderName) */
  currentSessionId: string | null;

  // ── Session history ────────────────────────────────────────────────────────
  sessions: SessionRecord[];

  // ── View state ─────────────────────────────────────────────────────────────
  /** Currently visible directory path (empty = root) */
  currentDirectory: string;
  /** Active filter tab */
  activeFilter: FilterTab;
  /** Single / grid view mode */
  viewMode: ViewMode;
  /** Sort mode for the filtered image list */
  sortMode: SortMode;
  /** Index into the *filtered* image list for the single-image view */
  focusedIndex: number;
  /** Whether the full-screen zoom viewer is open */
  isViewerOpen: boolean;

  // ── Scan progress ──────────────────────────────────────────────────────────
  isScanning: boolean;
  scanCount: number;

  // ── Actions ────────────────────────────────────────────────────────────────
  setStep: (step: AppStep) => void;
  loadFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
  setSelection: (id: string, path: string, selection: SelectionState) => void;
  setCurrentDirectory: (path: string) => void;
  setActiveFilter: (filter: FilterTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  setFocusedIndex: (index: number) => void;
  openViewer: (index: number) => void;
  closeViewer: () => void;
  navigateImage: (direction: 'next' | 'prev') => void;
  /** Mark current focused image and advance to the next */
  decideAndAdvance: (selection: SelectionState) => void;
  resetSession: () => void;

  // ── History actions ────────────────────────────────────────────────────────
  loadSessions: () => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  deleteSessionFromHistory: (id: string) => Promise<void>;
  /** Export the current session's progress as a JSON file download. */
  exportSessionProgress: () => void;
  /**
   * Import a previously-exported progress JSON into the current session.
   * Uses multi-strategy path matching so it works even when the JSON was
   * exported from a different root (parent or subdirectory of the current root).
   * Returns how many selections were matched and applied.
   */
  importProgressJson: (file: File) => Promise<{ matched: number; total: number }>;

  /**
   * Import a previously-exported progress JSON from the homepage (no folder open).
   * Creates or updates a session record in history and persists the selections so
   * they are ready when the user opens that folder later.
   * Returns how many selections were imported and the session name.
   */
  importSessionFromJson: (file: File) => Promise<{ imported: number; sessionName: string }>;

  // ── Selectors (stable references via useMemo in components) ───────────────
  getFilteredImages: () => ImageFile[];
  getStats: () => CurationStats;
  getDirectoryStats: (dirPath: string) => CurationStats;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ─────────────────────────────────────────────────────────
    step: 'folder-selection',
    images: [],
    selections: new Map(),
    directoryTree: null,
    rootHandle: null,
    rootName: '',
    currentSessionId: null,
    sessions: [],
    currentDirectory: '',
    activeFilter: 'all',
    viewMode: 'single',
    sortMode: 'name',
    focusedIndex: 0,
    isViewerOpen: false,
    isScanning: false,
    scanCount: 0,

    // ── Actions ───────────────────────────────────────────────────────────────
    setStep: (step) => set({ step }),

    loadFolder: async (handle) => {
      set({
        isScanning: true,
        scanCount: 0,
        images: [],
        selections: new Map(),
        directoryTree: null,
        rootHandle: handle,
        rootName: handle.name,
        currentDirectory: '',
        focusedIndex: 0,
        activeFilter: 'all',
        viewMode: 'single',
        currentSessionId: handle.name,
      });

      // Persist root handle so we can prompt for re-permission on reload
      await db.saveRootHandle(handle);
      // Also save per-session handle for history-based resume
      await db.saveSessionHandle(handle.name, handle);

      // Load previously saved selections.
      // Uses getAllSelectionsForSession so selections from sibling sessions
      // (e.g. a parent or child directory scanned separately) never bleed in.
      const saved = await db.getAllSelectionsForSession(handle.name);
      const selectionMap = new Map<string, SelectionState>(
        saved.map((s) => [pathToId(s.path), s.selection]),
      );

      const allImages: ImageFile[] = [];
      let batchCount = 0;

      for await (const image of scanDirectory(handle)) {
        allImages.push(image);
        batchCount++;

        // Stream updates to the UI every 100 images
        if (batchCount % 100 === 0) {
          set({ images: [...allImages], scanCount: allImages.length });
        }
      }

      // Build directory tree from the full flat list
      const tree = buildTreeFromImages(allImages, handle.name);

      set({
        images: allImages,
        selections: selectionMap,
        directoryTree: tree,
        isScanning: false,
        scanCount: allImages.length,
      });

      // Create or update the session record
      const stats = computeStats(allImages, selectionMap);
      const sessionId = handle.name;
      const existing = await db.getSession(sessionId);
      if (existing) {
        await db.updateSession(sessionId, {
          lastAccessedAt: Date.now(),
          totalImages: allImages.length,
          taken: stats.taken,
          dropped: stats.dropped,
          undecided: stats.undecided,
        });
      } else {
        await db.saveSession({
          id: sessionId,
          folderName: handle.name,
          startedAt: Date.now(),
          lastAccessedAt: Date.now(),
          totalImages: allImages.length,
          taken: stats.taken,
          dropped: stats.dropped,
          undecided: stats.undecided,
        });
      }
    },

    setSelection: (id, path, selection) => {
      set((state) => {
        const next = new Map(state.selections);
        next.set(id, selection);
        return { selections: next };
      });
      // Persist asynchronously — don't block UI.
      // Always use the current session so selections are namespaced; skip if
      // no session is open (shouldn't happen in normal flow).
      const { currentSessionId } = get();
      if (currentSessionId) {
        db.setSelection(currentSessionId, path, selection);
      }
      // Update session stats in the background
      const { images } = get();
      if (currentSessionId) {
        const { selections } = get();
        const stats = computeStats(images, selections);
        db.updateSession(currentSessionId, {
          lastAccessedAt: Date.now(),
          taken: stats.taken,
          dropped: stats.dropped,
          undecided: stats.undecided,
        });
      }
    },

    setCurrentDirectory: (path) =>
      set({ currentDirectory: path, focusedIndex: 0, activeFilter: 'all' }),

    setActiveFilter: (filter) =>
      set({ activeFilter: filter, focusedIndex: 0 }),

    setViewMode: (mode) => set({ viewMode: mode }),

    setSortMode: (mode) => set({ sortMode: mode, focusedIndex: 0 }),

    setFocusedIndex: (index) => set({ focusedIndex: index }),

    openViewer: (index) => set({ isViewerOpen: true, focusedIndex: index }),

    closeViewer: () => set({ isViewerOpen: false }),

    navigateImage: (direction) => {
      const { focusedIndex, getFilteredImages } = get();
      const filtered = getFilteredImages();
      if (filtered.length === 0) return;
      const next =
        direction === 'next'
          ? Math.min(focusedIndex + 1, filtered.length - 1)
          : Math.max(focusedIndex - 1, 0);
      set({ focusedIndex: next });
    },

    decideAndAdvance: (selection) => {
      const { focusedIndex, getFilteredImages } = get();
      const filtered = getFilteredImages();
      if (filtered.length === 0) return;
      const image = filtered[focusedIndex];
      if (!image) return;

      get().setSelection(image.id, image.path, selection);

      // Advance to next image if possible
      const next = Math.min(focusedIndex + 1, filtered.length - 1);
      set({ focusedIndex: next });
    },

    resetSession: () => {
      set({
        step: 'folder-selection',
        images: [],
        selections: new Map(),
        directoryTree: null,
        rootHandle: null,
        rootName: '',
        currentSessionId: null,
        currentDirectory: '',
        focusedIndex: 0,
        activeFilter: 'all',
        viewMode: 'single',
        sortMode: 'name',
        isViewerOpen: false,
        isScanning: false,
        scanCount: 0,
      });
      // Only clear the root handle so auto-resume does not re-trigger.
      // Selections are intentionally NOT wiped from IndexedDB here — the user
      // can always resume and pick up where they left off. If they want to
      // permanently delete a session they should use "Delete from history".
      db.clearRootHandle();
      clearThumbnailCache();
    },

    // ── History actions ───────────────────────────────────────────────────────
    loadSessions: async () => {
      const sessions = await db.getAllSessions();
      // Sort most-recently-accessed first
      sessions.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
      set({ sessions });
    },

    resumeSession: async (sessionId) => {
      const handle = await db.loadSessionHandle(sessionId);
      if (!handle) throw new Error('No saved handle for this session.');
      await get().loadFolder(handle);
    },

    deleteSessionFromHistory: async (id) => {
      await db.clearSelectionsForSession(id);
      await db.deleteSession(id);
      await db.deleteSessionHandle(id);
      set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) }));
    },

    exportSessionProgress: () => {
      const { images, selections, rootName, currentSessionId } = get();
      const data = images.map((img) => ({
        filename: img.filename,
        path: img.path,
        directory: img.directory,
        status: selections.get(img.id) ?? 'undecided',
        size: img.size,
        lastModified: img.lastModified,
      }));
      const stats = computeStats(images, selections);
      const output = {
        session: currentSessionId ?? rootName,
        exportedAt: new Date().toISOString(),
        stats,
        images: data,
      };
      const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(currentSessionId ?? 'session')}-progress.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    importProgressJson: async (file: File) => {
      const { images } = get();
      if (images.length === 0) {
        throw new Error('Open a folder first before importing a progress file.');
      }

      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file — could not parse.');
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid format — expected a JSON object at the root.');
      }

      const root = data as Record<string, unknown>;

      if (!Array.isArray(root.images)) {
        throw new Error('Invalid format — missing required "images" array.');
      }

      const VALID_STATUSES = new Set(['taken', 'dropped', 'undecided']);

      // Validate each entry
      const imageEntries = root.images as unknown[];
      imageEntries.forEach((e, i) => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
          throw new Error(`images[${i}]: expected an object.`);
        }
        const entry = e as Record<string, unknown>;
        if (typeof entry.filename !== 'string' || !entry.filename) {
          throw new Error(`images[${i}]: missing or invalid "filename" field.`);
        }
        if (typeof entry.status !== 'string' || !VALID_STATUSES.has(entry.status)) {
          throw new Error(`images[${i}] ("${entry.filename}"): "status" must be "taken", "dropped", or "undecided".`);
        }
      });

      // Build lookup maps over the currently-loaded images
      const byId = new Map<string, ImageFile>(images.map((img) => [img.id, img]));
      const byFilename = new Map<string, ImageFile[]>();
      for (const img of images) {
        const arr = byFilename.get(img.filename) ?? [];
        arr.push(img);
        byFilename.set(img.filename, arr);
      }

      const toApply = (imageEntries as Array<Record<string, string>>).filter(
        (e) => e.status && e.status !== 'undecided',
      );

      let matched = 0;
      for (const entry of toApply) {
        const { filename, path: importedPath, status } = entry;
        if (!filename || !status) continue;
        const found = findImportMatch(importedPath, filename, byId, byFilename);
        if (found) {
          get().setSelection(found.id, found.path, status as SelectionState);
          matched++;
        }
      }

      return { matched, total: toApply.length };
    },

    importSessionFromJson: async (file: File) => {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file — could not parse.');
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid format — expected a JSON object at the root.');
      }

      const root = data as Record<string, unknown>;

      if (typeof root.session !== 'string' || !root.session.trim()) {
        throw new Error('Invalid format — missing or empty "session" field (should be the folder name).');
      }

      if (!Array.isArray(root.images)) {
        throw new Error('Invalid format — missing required "images" array.');
      }

      const VALID_STATUSES = new Set(['taken', 'dropped', 'undecided']);

      // Validate each entry
      const imageEntries = root.images as unknown[];
      imageEntries.forEach((e, i) => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
          throw new Error(`images[${i}]: expected an object.`);
        }
        const entry = e as Record<string, unknown>;
        if (typeof entry.path !== 'string' || !entry.path) {
          throw new Error(`images[${i}]: missing or invalid "path" field.`);
        }
        if (typeof entry.status !== 'string' || !VALID_STATUSES.has(entry.status)) {
          throw new Error(`images[${i}] ("${entry.path}"): "status" must be "taken", "dropped", or "undecided".`);
        }
      });

      const sessionId = (root.session as string).trim();
      const entries = imageEntries as Array<Record<string, string>>;
      const toImport = entries.filter((e) => e.status && e.status !== 'undecided');

      // Persist each selection under this session ID
      for (const entry of toImport) {
        await db.setSelection(sessionId, entry.path, entry.status as SelectionState);
      }

      // Tally stats from the images array
      let taken = 0;
      let dropped = 0;
      for (const entry of entries) {
        if (entry.status === 'taken') taken++;
        else if (entry.status === 'dropped') dropped++;
      }
      const total = entries.length;

      // Create or update the session record in history
      const existing = await db.getSession(sessionId);
      if (existing) {
        await db.updateSession(sessionId, {
          lastAccessedAt: Date.now(),
          totalImages: Math.max(existing.totalImages, total),
          taken,
          dropped,
          undecided: total - taken - dropped,
        });
      } else {
        await db.saveSession({
          id: sessionId,
          folderName: sessionId,
          startedAt: Date.now(),
          lastAccessedAt: Date.now(),
          totalImages: total,
          taken,
          dropped,
          undecided: total - taken - dropped,
        });
      }

      // Refresh the history panel
      await get().loadSessions();

      return { imported: toImport.length, sessionName: sessionId };
    },

    // ── Selectors ─────────────────────────────────────────────────────────────
    getFilteredImages: () => {
      const { images, selections, currentDirectory, activeFilter, sortMode } = get();

      let result = images;

      // Filter by current directory (includes descendants)
      if (currentDirectory !== '') {
        result = result.filter(
          (img) =>
            img.directory === currentDirectory ||
            img.directory.startsWith(`${currentDirectory}/`),
        );
      }

      // Filter by selection state
      if (activeFilter !== 'all') {
        result = result.filter(
          (img) => (selections.get(img.id) ?? 'undecided') === activeFilter,
        );
      }

      // Sort (copy to avoid mutating original array)
      result = [...result].sort((a, b) => {
        if (sortMode === 'name') return a.filename.localeCompare(b.filename);
        if (sortMode === 'date') return b.lastModified - a.lastModified;
        if (sortMode === 'size') return b.size - a.size;
        return 0;
      });

      return result;
    },

    getStats: () => {
      const { images, selections } = get();
      return computeStats(images, selections);
    },

    getDirectoryStats: (dirPath) => {
      const { images, selections } = get();
      const scoped =
        dirPath === ''
          ? images
          : images.filter(
              (img) =>
                img.directory === dirPath ||
                img.directory.startsWith(`${dirPath}/`),
            );
      return computeStats(scoped, selections);
    },
  })),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStats(
  images: ImageFile[],
  selections: Map<string, SelectionState>,
): CurationStats {
  let taken = 0;
  let dropped = 0;
  let undecided = 0;

  for (const img of images) {
    const s = selections.get(img.id) ?? 'undecided';
    if (s === 'taken') taken++;
    else if (s === 'dropped') dropped++;
    else undecided++;
  }

  const total = images.length;
  const reviewed = taken + dropped;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  return { total, taken, dropped, undecided, progressPct };
}

/**
 * Finds the best match in the current session's image list for an entry from
 * an imported progress JSON.
 *
 * Strategies (in priority order):
 *  1. Exact encoded-path match  — same root, nothing changed
 *  2. Suffix match              — import root was a parent dir of current root
 *                                  e.g. import path "Paris/img.jpg", current "img.jpg"
 *  3. Prefix match              — import root was a child dir of current root
 *                                  e.g. import path "img.jpg", current "Paris/img.jpg"
 *  4. Unambiguous filename      — only one image with that filename exists
 */
function findImportMatch(
  importedPath: string,
  filename: string,
  byId: Map<string, ImageFile>,
  byFilename: Map<string, ImageFile[]>,
): ImageFile | null {
  // 1. Exact match
  if (importedPath) {
    const exact = byId.get(pathToId(importedPath));
    if (exact) return exact;
  }

  const candidates = byFilename.get(filename) ?? [];
  if (candidates.length === 0) return null;

  if (importedPath) {
    // 2. Suffix: imported path ends with current img path
    //    (current session is rooted deeper — import used an ancestor root)
    const suffixMatch = candidates.find(
      (img) => importedPath === img.path || importedPath.endsWith('/' + img.path),
    );
    if (suffixMatch) return suffixMatch;

    // 3. Prefix: current img path ends with imported path
    //    (current session is rooted higher — import used a descendant root)
    const prefixMatch = candidates.find(
      (img) => img.path === importedPath || img.path.endsWith('/' + importedPath),
    );
    if (prefixMatch) return prefixMatch;
  }

  // 4. Unambiguous filename fallback
  if (candidates.length === 1) return candidates[0];

  return null;
}
