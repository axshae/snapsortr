/**
 * IndexedDB persistence layer via the `idb` library.
 *
 * Stores:
 *   1. selections  – path → SelectionState (shared across all sessions)
 *   2. handles     – directory handles, keyed by 'root' or session id
 *   3. sessions    – session metadata records (v2+)
 */
import { openDB, IDBPDatabase } from 'idb';
import { SelectionState, PersistedSelection, SessionRecord } from '../types';

const DB_NAME = 'image-curator';
const DB_VERSION = 3;
const STORE_SELECTIONS = 'selections';
const STORE_HANDLES = 'handles';
const STORE_SESSIONS = 'sessions';

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── Handles store (v1+) ─────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      // ── Sessions store (v2+) ────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      // ── Selections store (v3+): per-session namespacing ─────────────────
      // Replaces the flat v1/v2 global store. Existing selection data is
      // cleared (it can't be migrated without knowing each record's session).
      if (oldVersion < 3) {
        if (db.objectStoreNames.contains(STORE_SELECTIONS)) {
          db.deleteObjectStore(STORE_SELECTIONS);
        }
        const selStore = db.createObjectStore(STORE_SELECTIONS, { keyPath: 'key' });
        selStore.createIndex('by-session', 'sessionId');
      }
    },
  });
  return _db;
}

// ─── Selection CRUD ──────────────────────────────────────────────────────────
// In v3 the selections store is keyed by "<sessionId>|<path>" so that
// different sessions scanning  the same files at different root depths
// never share or overwrite each other's data.

export async function setSelection(
  sessionId: string,
  path: string,
  selection: SelectionState,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE_SELECTIONS, {
    key: `${sessionId}|${path}`,
    sessionId,
    path,
    selection,
  });
}

/** Loads all selections for a given session, ready to rebuild the in-memory Map. */
export async function getAllSelectionsForSession(
  sessionId: string,
): Promise<PersistedSelection[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_SELECTIONS, 'by-session', sessionId);
  return rows.map((r) => ({ path: (r as { path: string; selection: SelectionState }).path, selection: (r as { selection: SelectionState }).selection }));
}

/** Remove all selection records for a single session (used by resetSession). */
export async function clearSelectionsForSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_SELECTIONS, 'by-session', sessionId);
  const tx = db.transaction(STORE_SELECTIONS, 'readwrite');
  for (const row of rows) {
    tx.store.delete((row as { key: string }).key);
  }
  await tx.done;
}

/** Nuclear clear — removes all selections across all sessions. */
export async function clearSelections(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_SELECTIONS);
}

// ─── Root handle persistence ──────────────────────────────────────────────────

export async function saveRootHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE_HANDLES, handle, 'root');
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDb();
  return (db.get(STORE_HANDLES, 'root') as Promise<FileSystemDirectoryHandle | undefined>).then(
    (h) => h ?? null,
  );
}

export async function clearRootHandle(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_HANDLES, 'root');
}

// ─── Per-session handle persistence ──────────────────────────────────────────

export async function saveSessionHandle(
  sessionId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE_HANDLES, handle, `session:${sessionId}`);
}

export async function loadSessionHandle(
  sessionId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDb();
  const h = await db.get(STORE_HANDLES, `session:${sessionId}`) as FileSystemDirectoryHandle | undefined;
  return h ?? null;
}

export async function deleteSessionHandle(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_HANDLES, `session:${sessionId}`);
}

// ─── Session metadata CRUD ────────────────────────────────────────────────────

export async function saveSession(session: SessionRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE_SESSIONS, session);
}

export async function updateSession(
  id: string,
  updates: Partial<Omit<SessionRecord, 'id'>>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_SESSIONS, id) as SessionRecord | undefined;
  if (!existing) return;
  await db.put(STORE_SESSIONS, { ...existing, ...updates });
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDb();
  return db.getAll(STORE_SESSIONS) as Promise<SessionRecord[]>;
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const db = await getDb();
  return db.get(STORE_SESSIONS, id) as Promise<SessionRecord | undefined>;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_SESSIONS, id);
}
