import { useState } from 'react';
import {
  X, History, FolderOpen, Download, PlayCircle, Trash2, Check,
  X as XIcon, Trash,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { getAllSelectionsForSession } from '../services/database';
import { pickDirectory } from '../services/fileSystem';
import { SessionRecord } from '../types';
import { cn } from '../utils/cn';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionHistoryDrawer({ isOpen, onClose }: Props) {
  const {
    sessions, resumeSession, deleteSessionFromHistory,
    setStep, currentSessionId, images, selections,
  } = useAppStore(useShallow((s) => ({
    sessions: s.sessions,
    resumeSession: s.resumeSession,
    deleteSessionFromHistory: s.deleteSessionFromHistory,
    setStep: s.setStep,
    currentSessionId: s.currentSessionId,
    images: s.images,
    selections: s.selections,
  })));

  const [resumingId, setResumingId] = useState<string | null>(null);
  const hasActiveImages = images.length > 0;

  async function handleResume(session: SessionRecord) {
    setResumingId(session.id);
    try {
      await resumeSession(session.id);
      setStep('image-review');
      onClose();
    } catch {
      setResumingId(null);
      try {
        const handle = await pickDirectory();
        const { loadFolder } = useAppStore.getState();
        await loadFolder(handle);
        setStep('image-review');
        onClose();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setResumingId(null);
        }
      }
    }
  }

  async function handleExport(e: React.MouseEvent, session: SessionRecord) {
    e.stopPropagation();
    const sels = await getAllSelectionsForSession(session.id);
    const imgs = sels.map((s) => {
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
      images: imgs,
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.folderName}-progress.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteSessionFromHistory(id);
  }

  async function handleClearAll() {
    const ids = useAppStore.getState().sessions.map((s) => s.id);
    for (const id of ids) {
      await deleteSessionFromHistory(id);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-96 max-w-full flex flex-col',
          'bg-curator-surface border-l border-curator-border shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-curator-border shrink-0">
          <History size={16} className="text-curator-accent" />
          <span className="text-sm font-semibold text-curator-text flex-1">Session History</span>
          {sessions.length > 0 && (
            <span className="text-xs text-curator-muted">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          )}
          {sessions.length > 0 && (
            <button
              onClick={handleClearAll}
              title="Clear all sessions"
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition-colors ml-1"
            >
              <Trash size={12} />
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="btn-icon ml-1"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <History size={32} className="text-curator-border" />
              <p className="text-sm text-curator-muted">No sessions yet.</p>
              <p className="text-xs text-curator-muted">Sessions appear here after you open a folder.</p>
            </div>
          ) : (
            <div className="divide-y divide-curator-border">
              {sessions.map((session) => {
                const isActive = currentSessionId === session.id && hasActiveImages;
                return (
                  <DrawerSessionCard
                    key={session.id}
                    session={session}
                    isActive={isActive}
                    isResuming={resumingId === session.id}
                    currentSelections={isActive ? selections : null}
                    onResume={() => handleResume(session)}
                    onExport={(e) => handleExport(e, session)}
                    onDelete={(e) => handleDelete(e, session.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Session card (drawer version) ───────────────────────────────────────────

function DrawerSessionCard({
  session,
  isActive,
  isResuming,
  currentSelections,
  onResume,
  onExport,
  onDelete,
}: {
  session: SessionRecord;
  isActive: boolean;
  isResuming: boolean;
  currentSelections: Map<string, import('../types').SelectionState> | null;
  onResume: () => void;
  onExport: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const taken = isActive && currentSelections
    ? [...currentSelections.values()].filter((v) => v === 'taken').length
    : session.taken;
  const dropped = isActive && currentSelections
    ? [...currentSelections.values()].filter((v) => v === 'dropped').length
    : session.dropped;
  const total = session.totalImages;
  const reviewed = taken + dropped;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const timeAgo = formatTimeAgo(session.lastAccessedAt);

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 px-4 py-3 cursor-pointer hover:bg-curator-panel transition-colors',
        isActive && 'bg-curator-accent/5 border-l-2 border-l-curator-accent',
        isResuming && 'opacity-60 pointer-events-none',
      )}
      onClick={onResume}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen size={14} className="text-curator-accent shrink-0" />
        <span className="text-sm font-medium text-curator-text truncate flex-1">
          {session.folderName}
        </span>
        {isActive && (
          <span className="text-[10px] font-semibold bg-curator-accent/20 text-curator-accent px-1.5 py-0.5 rounded shrink-0">
            Active
          </span>
        )}
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

      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 text-green-400">
          <Check size={10} strokeWidth={3} />
          {taken} taken
        </span>
        <span className="flex items-center gap-1 text-red-400">
          <XIcon size={10} strokeWidth={3} />
          {dropped} dropped
        </span>
        <span className="text-curator-muted">{total - reviewed} left</span>
        <span
          className="ml-auto text-curator-muted tabular-nums"
          title={new Date(session.lastAccessedAt).toLocaleString()}
        >
          {timeAgo}
        </span>
      </div>

      <div className="h-1 w-full bg-curator-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progressPct}%`, background: progressPct === 100 ? '#22c55e' : '#6366f1' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-curator-muted">
        <span>{total.toLocaleString()} images total</span>
        <span className="tabular-nums">{progressPct}% reviewed</span>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
