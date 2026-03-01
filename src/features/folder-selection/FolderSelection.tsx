/**
 * FolderSelection — Step 1
 *
 * Lets the user:
 *   1. Pick a new folder via File System Access API
 *   2. Resume a session from the persistent history panel
 */
import { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, Keyboard, Database, Package,
  Loader2, History, Trash2, Download, PlayCircle, Check, X, Upload,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { pickDirectory, requestHandlePermission } from '../../services/fileSystem';
import { getAllSelectionsForSession } from '../../services/database';
import { useResumeSession } from '../../hooks/useResumeSession';
import { SessionRecord } from '../../types';
import { cn } from '../../utils/cn';

export function FolderSelection() {
  const {
    loadFolder, setStep, isScanning, scanCount,
    sessions, loadSessions, resumeSession, deleteSessionFromHistory, exportSessionProgress,
    importSessionFromJson,
    images, selections,
  } = useAppStore(useShallow((s) => ({
    loadFolder: s.loadFolder,
    setStep: s.setStep,
    isScanning: s.isScanning,
    scanCount: s.scanCount,
    sessions: s.sessions,
    loadSessions: s.loadSessions,
    resumeSession: s.resumeSession,
    deleteSessionFromHistory: s.deleteSessionFromHistory,
    exportSessionProgress: s.exportSessionProgress,
    importSessionFromJson: s.importSessionFromJson,
    images: s.images,
    selections: s.selections,
  })));

  const { resumeHandle, isChecking, permissionGranted, clearResume } = useResumeSession();
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const importJsonRef = useRef<HTMLInputElement>(null);
  const autoResumed = useRef(false);

  // Load session history on mount
  useEffect(() => {
    loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resume when the browser already holds permission (no user gesture needed).
  // Guard: skip if images are already loaded — user navigated back from review.
  useEffect(() => {
    if (!isChecking && resumeHandle && permissionGranted && !autoResumed.current && images.length === 0) {
      autoResumed.current = true;
      startScan(resumeHandle).catch((err) => {
        autoResumed.current = false;
        setError(err instanceof Error ? err.message : 'Failed to resume session.');
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecking, resumeHandle, permissionGranted]);

  async function handlePickFolder() {
    setError(null);
    try {
      const handle = await pickDirectory();
      await startScan(handle);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  }

  async function handleResume() {
    if (!resumeHandle) return;
    setError(null);
    try {
      const granted = await requestHandlePermission(resumeHandle);
      if (!granted) {
        setError('Permission was denied. Please select the folder again.');
        clearResume();
        return;
      }
      await startScan(resumeHandle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session.');
    }
  }

  async function handleResumeSession(session: SessionRecord) {
    setError(null);
    setResumingId(session.id);
    try {
      await resumeSession(session.id);
      setStep('image-review');
    } catch {
      // Handle not available — fall back to directory picker
      setResumingId(null);
      setError(`Could not restore "${session.folderName}" automatically. Please re-open the folder.`);
      try {
        const handle = await pickDirectory();
        await startScan(handle);
      } catch (err2) {
        if (err2 instanceof Error && err2.name !== 'AbortError') {
          setError(err2.message);
        }
      }
    }
  }

  async function handleDeleteSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteSessionFromHistory(id);
  }

  function handleExportSession(e: React.MouseEvent) {
    e.stopPropagation();
    // Only works when images are loaded in memory
    exportSessionProgress();
  }

  async function handleExportSessionCard(e: React.MouseEvent, session: SessionRecord) {
    e.stopPropagation();
    // Load per-image selections for this session from IndexedDB so the
    // exported file is fully importable (contains an `images` array).
    const selections = await getAllSelectionsForSession(session.id);
    const images = selections.map((s) => {
      const lastSlash = s.path.lastIndexOf('/');
      return {
        path: s.path,
        filename: lastSlash === -1 ? s.path : s.path.slice(lastSlash + 1),
        directory: lastSlash === -1 ? '' : s.path.slice(0, lastSlash),
        status: s.selection,
      };
    });
    const output = {
      session: session.folderName,
      exportedAt: new Date().toISOString(),
      stats: {
        total: session.totalImages,
        taken: session.taken,
        dropped: session.dropped,
        undecided: session.totalImages - session.taken - session.dropped,
        progressPct: session.totalImages > 0
          ? Math.round(((session.taken + session.dropped) / session.totalImages) * 100)
          : 0,
      },
      images,
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.folderName}-progress.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-imported if needed
    e.target.value = '';
    if (!file) return;
    setImportStatus(null);
    setError(null);
    try {
      const { imported, sessionName } = await importSessionFromJson(file);
      setImportStatus({
        ok: true,
        message: `Imported ${imported} selection${imported !== 1 ? 's' : ''} for "${sessionName}". Resume it from history to continue.`,
      });
    } catch (err) {
      setImportStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to import JSON.',
      });
    }
  }

  async function startScan(handle: FileSystemDirectoryHandle) {
    await loadFolder(handle);
    setStep('image-review');
  }

  // Show full-screen spinner during auto-resume or active scan.
  // Guard the permissionGranted branch with images.length === 0 so navigating
  // back via the Home button (session still in memory) doesn't show the spinner.
  if (isChecking || (permissionGranted && resumeHandle && !error && images.length === 0) || (isScanning && !error)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <Loader2 size={32} className="animate-spin text-curator-accent" />
        {!isChecking && (
          <>
            <p className="text-sm font-medium text-curator-text">
              {isScanning
                ? 'Scanning folder…'
                : <>Resuming session — <span className="text-curator-accent">{resumeHandle!.name}</span></>}
            </p>
            {isScanning && (
              <p className="text-xs text-curator-muted tabular-nums">
                {scanCount.toLocaleString()} images found…
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // Show per-session resume spinner
  if (resumingId) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <Loader2 size={32} className="animate-spin text-curator-accent" />
        <p className="text-sm font-medium text-curator-text">
          Resuming <span className="text-curator-accent">{resumingId}</span>…
        </p>
      </div>
    );
  }

  const isFsaSupported = 'showDirectoryPicker' in window;
  const hasHistory = sessions.length > 0;

  // Check if there's a current session loaded (images in memory) for export
  const hasActiveImages = images.length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="flex flex-col lg:flex-row flex-1 gap-0 min-h-0">

        {/* ── Left: pick folder + hints ─────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center gap-8 px-6 py-12 lg:flex-1 animate-fade-in">
          {/* Hero */}
          <div className="text-center space-y-3 max-w-lg">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-curator-panel border border-curator-border flex items-center justify-center p-3">
              <img src={logo} alt="SnapSortr" className="w-full h-full object-contain" draggable={false} />
            </div>
            <h1 className="text-4xl font-bold text-curator-text font-display tracking-tight">SnapSortr</h1>
            <p className="text-curator-muted text-base leading-relaxed">
              Rapidly curate thousands of images with simple keyboard shortcuts.
              Sort, keep or drop — all without moving a single file.
            </p>
          </div>

          {/* Action card */}
          <div className="w-full max-w-sm space-y-4 animate-slide-up">
            {/* Resume banner — only shown when a browser permission prompt is required */}
            {resumeHandle && !permissionGranted && (
              <div className="rounded-xl border border-curator-accent/30 bg-curator-accent/5 px-4 py-3 space-y-2">
                <p className="text-sm text-curator-text font-medium">Resume previous session</p>
                <p className="text-xs text-curator-muted">
                  Folder: <span className="text-curator-text">{resumeHandle.name}</span>
                </p>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleResume} className="flex-1 btn-primary text-sm py-2">
                    Resume
                  </button>
                  <button onClick={clearResume} className="flex-1 btn-secondary text-sm py-2">
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Pick folder */}
            {!isFsaSupported ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                Your browser does not support the File System Access API. Please
                use Chrome or Edge (desktop).
              </div>
            ) : (
              <button
                onClick={handlePickFolder}
                className={cn(
                  'w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed',
                  'border-curator-border hover:border-curator-accent/60',
                  'bg-curator-surface hover:bg-curator-panel',
                  'py-8 px-6 text-center transition-all group',
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-curator-panel group-hover:bg-curator-accent/10 flex items-center justify-center transition-colors">
                  <FolderOpen size={24} strokeWidth={1.5} className="text-curator-muted group-hover:text-curator-accent transition-colors" />
                </div>
                <div>
                  <p className="text-curator-text group-hover:text-white font-semibold text-sm transition-colors">
                    Select Image Folder
                  </p>
                  <p className="text-xs text-curator-muted mt-0.5">
                    Subdirectories are scanned automatically
                  </p>
                </div>
              </button>
            )}

            {/* Import session from JSON */}
            <button
              onClick={() => importJsonRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 btn-secondary text-sm py-2"
            >
              <Upload size={15} />
              Import session from JSON
            </button>
            <input
              ref={importJsonRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportJson}
            />

            {/* Import status feedback */}
            {importStatus && (
              <p
                className={cn(
                  'text-sm text-center rounded-lg px-3 py-2 border',
                  importStatus.ok
                    ? 'text-green-400 bg-green-500/10 border-green-500/20'
                    : 'text-red-400 bg-red-500/10 border-red-500/20',
                )}
              >
                {importStatus.message}
              </p>
            )}

            {/* Export current session progress (only when images are in memory) */}
            {hasActiveImages && (
              <button
                onClick={handleExportSession}
                className="w-full flex items-center justify-center gap-2 btn-secondary text-sm py-2"
              >
                <Download size={15} />
                Export current session progress (.json)
              </button>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                {error}
              </p>
            )}
          </div>

          {/* Feature hints */}
          <div className="grid grid-cols-3 gap-4 max-w-lg w-full text-center animate-fade-in">
            {[
              { icon: <Keyboard size={20} className="text-curator-accent" />, title: 'Keyboard First', desc: 'J/F to sort instantly' },
              { icon: <Database size={20} className="text-curator-accent" />, title: 'Auto-saved', desc: 'Progress in IndexedDB' },
              { icon: <Package size={20} className="text-curator-accent" />, title: 'ZIP Export', desc: 'Preserves folder structure' },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-curator-surface border border-curator-border p-3 space-y-1"
              >
                <div>{f.icon}</div>
                <p className="text-xs font-semibold text-curator-text">{f.title}</p>
                <p className="text-xs text-curator-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: session history ────────────────────────────────────── */}
        {hasHistory && (
          <aside
            className={cn(
              'border-t lg:border-t-0 lg:border-l border-curator-border bg-curator-surface flex flex-col transition-all',
              historyOpen ? 'lg:w-96' : 'lg:w-12',
            )}
          >
            <div className="px-4 py-3 border-b border-curator-border flex items-center gap-2 shrink-0">
              {historyOpen && (
                <>
                  <History size={16} className="text-curator-accent" />
                  <span className="text-sm font-semibold text-curator-text">Session History</span>
                  <span className="ml-auto text-xs text-curator-muted">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
                </>
              )}
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                title={historyOpen ? 'Collapse history' : 'Expand history'}
                className={cn(
                  'w-6 h-6 flex items-center justify-center rounded text-curator-muted hover:text-curator-text hover:bg-curator-border transition-colors shrink-0',
                  !historyOpen && 'mx-auto',
                )}
              >
                {historyOpen ? <X size={14} /> : <History size={14} />}
              </button>
            </div>

            {historyOpen && (
              <div className="flex-1 overflow-y-auto divide-y divide-curator-border">
                {sessions.map((session) => {
                  const isActive = useAppStore.getState().currentSessionId === session.id && hasActiveImages;
                  return (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onResume={() => handleResumeSession(session)}
                      onDelete={(e) => handleDeleteSession(e, session.id)}
                      onExport={(e) => handleExportSessionCard(e, session)}
                      isCurrentSession={isActive}
                      currentSelections={isActive ? selections : null}
                    />
                  );
                })}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onResume,
  onDelete,
  onExport,
  isCurrentSession,
  currentSelections,
}: {
  session: SessionRecord;
  onResume: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onExport: (e: React.MouseEvent) => void;
  isCurrentSession: boolean;
  currentSelections: Map<string, import('../../types').SelectionState> | null;
}) {
  // Use live stats if this is the active session, else stored snapshot
  const taken = isCurrentSession && currentSelections
    ? [...currentSelections.values()].filter((v) => v === 'taken').length
    : session.taken;
  const dropped = isCurrentSession && currentSelections
    ? [...currentSelections.values()].filter((v) => v === 'dropped').length
    : session.dropped;
  const total = session.totalImages;
  const reviewed = taken + dropped;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  const lastAccessed = new Date(session.lastAccessedAt);
  const timeAgo = formatTimeAgo(session.lastAccessedAt);

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 px-4 py-3 cursor-pointer hover:bg-curator-panel transition-colors',
        isCurrentSession && 'bg-curator-accent/5 border-l-2 border-l-curator-accent',
      )}
      onClick={onResume}
    >
      {/* Row 1: folder name + actions */}
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen size={14} className="text-curator-accent shrink-0" />
        <span className="text-sm font-medium text-curator-text truncate flex-1">
          {session.folderName}
        </span>
        {isCurrentSession && (
          <span className="text-[10px] font-semibold bg-curator-accent/20 text-curator-accent px-1.5 py-0.5 rounded shrink-0">
            Active
          </span>
        )}
        {/* Action buttons — visible on hover */}
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            title="Export progress as JSON"
            onClick={onExport}
            className="w-6 h-6 flex items-center justify-center rounded text-curator-muted hover:text-white hover:bg-curator-border transition-colors"
          >
            <Download size={12} />
          </button>
          <button
            title="Resume session"
            onClick={(e) => { e.stopPropagation(); onResume(); }}
            className="w-6 h-6 flex items-center justify-center rounded text-curator-muted hover:text-curator-accent hover:bg-curator-border transition-colors"
          >
            <PlayCircle size={12} />
          </button>
          <button
            title="Delete from history"
            onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded text-curator-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Row 2: stats badges */}
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-green-400">
          <Check size={10} strokeWidth={3} />
          {taken} taken
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <X size={10} strokeWidth={3} />
          {dropped} dropped
        </span>
        <span className="text-curator-muted">
          {total - reviewed} left
        </span>
        <span className="ml-auto text-curator-muted tabular-nums" title={lastAccessed.toLocaleString()}>
          {timeAgo}
        </span>
      </div>

      {/* Row 3: progress bar */}
      <div className="h-1 w-full bg-curator-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${progressPct}%`,
            background: progressPct === 100 ? '#22c55e' : '#6366f1',
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-curator-muted">
        <span>{total.toLocaleString()} images total</span>
        <span className="tabular-nums">{progressPct}% reviewed</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}
