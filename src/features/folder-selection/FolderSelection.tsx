/**
 * FolderSelection — Step 1
 *
 * Lets the user:
 *   1. Pick a new folder via File System Access API
 *   2. Resume a session from the persistent history panel
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen, Keyboard, Database, Package, ShieldCheck,
  Loader2, Download, Upload,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { pickDirectory, requestHandlePermission } from '../../services/fileSystem';
import { useResumeSession } from '../../hooks/useResumeSession';
import { cn } from '../../utils/cn';

export function FolderSelection() {
  const {
    loadFolder, setStep, isScanning, resetSession, scanCount,
    loadSessions, exportSessionProgress,
    importSessionFromJson,
    images,
  } = useAppStore(useShallow((s) => ({
    loadFolder: s.loadFolder,
    setStep: s.setStep,
    isScanning: s.isScanning,
    resetSession: s.resetSession,
    scanCount: s.scanCount,
    loadSessions: s.loadSessions,
    exportSessionProgress: s.exportSessionProgress,
    importSessionFromJson: s.importSessionFromJson,
    images: s.images,
  })));

  const { resumeHandle, isChecking, permissionGranted, clearResume } = useResumeSession();
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const importJsonRef = useRef<HTMLInputElement>(null);
  const autoResumed = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showCancel, setShowCancel] = useState(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show a cancel button after 15 seconds of active scanning
  useEffect(() => {
    if (isScanning) {
      setShowCancel(false);
      cancelTimerRef.current = setTimeout(() => setShowCancel(true), 15_000);
    } else {
      setShowCancel(false);
      if (cancelTimerRef.current !== null) {
        clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = null;
      }
    }
    return () => {
      if (cancelTimerRef.current !== null) {
        clearTimeout(cancelTimerRef.current);
      }
    };
  }, [isScanning]);

  const handleCancelScan = useCallback(() => {
    autoResumed.current = false;
    resetSession();
  }, [resetSession]);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    setError(null);
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handle = await (item as any).getAsFileSystemHandle();
          if (handle && handle.kind === 'directory') {
            await startScan(handle as FileSystemDirectoryHandle);
            return;
          }
        } catch {
          // handle not available in this browser
        }
      }
    }
    setError('Please drop a folder, not individual files.');
  }

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

  function handleExportSession(e: React.MouseEvent) {
    e.stopPropagation();
    exportSessionProgress();
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
                Found {<span className="text-curator-text">{scanCount.toLocaleString()}</span>} file{scanCount !== 1 ? 's' : ''}
              </p>
            )}
            {isScanning && showCancel && (
              <button
                onClick={handleCancelScan}
                className="mt-2 px-4 py-1.5 rounded-lg border border-curator-border text-sm text-curator-muted hover:text-curator-text hover:border-curator-accent/60 transition-colors"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // Show per-session resume spinner removed — handled by drawer now

  const isFsaSupported = 'showDirectoryPicker' in window;
  const hasActiveImages = images.length > 0;

  return (
    <div
      className="flex flex-col flex-1 overflow-y-auto"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-6 sm:gap-8 px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">

        {/* Hero */}
        <div className="text-center space-y-3 max-w-lg">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-curator-panel border border-curator-border flex items-center justify-center p-3">
            <img src={logo} alt="SnapSortr" className="w-full h-full object-contain" draggable={false} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-curator-text font-display tracking-tight">SnapSortr</h1>
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
                  'py-8 px-6 text-center transition-all group',
                  isDragging
                    ? 'border-curator-accent bg-curator-accent/10 scale-[1.01]'
                    : 'border-curator-border hover:border-curator-accent/60 bg-curator-surface hover:bg-curator-panel',
                )}
              >
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                  isDragging ? 'bg-curator-accent/20' : 'bg-curator-panel group-hover:bg-curator-accent/10',
                )}>
                  <FolderOpen size={24} strokeWidth={1.5} className={cn(
                    'transition-colors',
                    isDragging ? 'text-curator-accent' : 'text-curator-muted group-hover:text-curator-accent',
                  )} />
                </div>
                <div>
                  <p className={cn(
                    'font-semibold text-sm transition-colors',
                    isDragging ? 'text-curator-accent' : 'text-curator-text group-hover:text-white',
                  )}>
                    {isDragging ? 'Drop folder here' : 'Select Image Folder'}
                  </p>
                  <p className="text-xs text-curator-muted mt-0.5">
                    {isDragging ? 'Release to start scanning' : 'Click to browse · or drag & drop a folder'}
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

          {/* Feature descriptions — 2×2 on mobile, 4-column on sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl animate-fade-in">
            {[
              {
                icon: <ShieldCheck size={20} className="text-curator-accent" />,
                title: 'Private by Design',
                desc: 'Images never leave your device. Nothing is uploaded or synced to any server.',
              },
              {
                icon: <Keyboard size={20} className="text-curator-accent" />,
                title: 'Keyboard-First',
                desc: 'J to keep, F to drop, arrows to navigate. No mouse needed.',
              },
              {
                icon: <Database size={20} className="text-curator-accent" />,
                title: 'Auto-Saved',
                desc: 'Every decision saves instantly. Resume any session after a restart.',
              },
              {
                icon: <Package size={20} className="text-curator-accent" />,
                title: 'Flexible Export',
                desc: 'ZIP download or copy to folder. Preserve your original structure.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-curator-surface border border-curator-border px-3 py-4 space-y-2 select-none"
              >
                <div className="flex justify-center">{f.icon}</div>
                <p className="text-xs font-semibold text-curator-text text-center">{f.title}</p>
                <p className="text-xs text-curator-muted text-center leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
}


