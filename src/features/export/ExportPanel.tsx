/**
 * ExportPanel — Step 3
 *
 * Options:
 *   - What to export: Taken / Dropped / Undecided / All
 *   - How: ZIP download or File System API (save to folder)
 *   - Preserve directory structure: yes / no
 *
 * Shows per-category counts and a live progress bar during export.
 */
import { useState } from 'react';
import { ChevronLeft, Package, FolderOpen, Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { exportImages } from '../../services/export';
import { ExportTarget, ExportOptions } from '../../types';
import { cn } from '../../utils/cn';

const hasFsa = 'showDirectoryPicker' in window;

export function ExportPanel() {
  const { images, selections, setStep, getStats } = useAppStore(useShallow((s) => ({
    images: s.images,
    selections: s.selections,
    setStep: s.setStep,
    getStats: s.getStats,
  })));

  const stats = getStats();

  const [target, setTarget] = useState<ExportTarget>('taken');
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [method, setMethod] = useState<'zip' | 'filesystem'>('zip');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const targetImages = images.filter((img) => {
    if (target === 'all') return true;
    return (selections.get(img.id) ?? 'undecided') === target;
  });

  async function handleExport() {
    if (targetImages.length === 0) return;
    setIsExporting(true);
    setDone(false);
    setError(null);
    setProgress({ done: 0, total: targetImages.length });

    const options: ExportOptions = {
      target,
      preserveStructure,
      method,
    };

    try {
      await exportImages(targetImages, options, (done, total) =>
        setProgress({ done, total }),
      );
      setDone(true);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsExporting(false);
    }
  }

  const progressPct =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* Back button */}
      <div className="px-6 py-3 border-b border-curator-border bg-curator-surface flex items-center gap-3">
        <button
          onClick={() => setStep('image-review')}
          className="flex items-center gap-1.5 text-sm text-curator-muted hover:text-curator-text transition-colors"
        >
          <ChevronLeft size={16} />
          Back to Review
        </button>
        <h2 className="text-base font-semibold text-curator-text">Export Images</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* ── Stats overview ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total" count={stats.total} color="text-curator-text" />
            <StatCard label="Taken" count={stats.taken} color="text-green-400" />
            <StatCard label="Dropped" count={stats.dropped} color="text-red-400" />
            <StatCard label="Undecided" count={stats.undecided} color="text-gray-400" />
          </div>

          {/* ── What to export ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-curator-muted uppercase tracking-wider">
              What to export
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { value: 'taken', label: 'Taken', count: stats.taken, color: 'green' },
                  { value: 'dropped', label: 'Dropped', count: stats.dropped, color: 'red' },
                  { value: 'undecided', label: 'Undecided', count: stats.undecided, color: 'gray' },
                  { value: 'all', label: 'All', count: stats.total, color: 'indigo' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTarget(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm font-medium',
                    target === opt.value
                      ? targetActiveClass(opt.color)
                      : 'border-curator-border bg-curator-surface text-curator-muted hover:border-curator-panel hover:text-curator-text',
                  )}
                >
                  <span className="text-xl font-bold tabular-nums">{opt.count}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── How to export ──────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-curator-muted uppercase tracking-wider">
              Export method
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <MethodCard
                active={method === 'zip'}
                icon={<Package size={24} />}
                title="Download as ZIP"
                desc="Works in all browsers"
                onClick={() => setMethod('zip')}
              />
              <MethodCard
                active={method === 'filesystem'}
                icon={<FolderOpen size={24} />}
                title="Save to Folder"
                desc={
                  hasFsa
                    ? 'Choose destination via file picker'
                    : 'Not supported in this browser'
                }
                disabled={!hasFsa}
                onClick={() => hasFsa && setMethod('filesystem')}
              />
            </div>
          </section>

          {/* ── Options ────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-curator-muted uppercase tracking-wider">
              Options
            </h3>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setPreserveStructure((v) => !v)}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors',
                  preserveStructure ? 'bg-curator-accent' : 'bg-curator-border',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    preserveStructure ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-curator-text">
                  Preserve directory structure
                </p>
                <p className="text-xs text-curator-muted">
                  Recreate original sub-folders inside the export
                </p>
              </div>
            </label>
          </section>

          {/* ── Export button ──────────────────────────────────────────────── */}
          <div className="space-y-3">
            {isExporting && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-curator-muted">
                  <span>Exporting…</span>
                  <span className="tabular-nums">
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="h-2 bg-curator-panel rounded-full overflow-hidden">
                  <div
                    className="h-full bg-curator-accent rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {done && !isExporting && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
                <Check size={14} />
                Export complete — {progress.total} image
                {progress.total !== 1 ? 's' : ''} exported
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={isExporting || targetImages.length === 0}
              className={cn(
                'w-full btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isExporting
                ? `Exporting ${progressPct}%…`
                : `Export ${targetImages.length} Image${targetImages.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="bg-curator-surface border border-curator-border rounded-xl p-3 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', color)}>
        {count.toLocaleString()}
      </p>
      <p className="text-xs text-curator-muted mt-0.5">{label}</p>
    </div>
  );
}

function MethodCard({
  active,
  icon,
  title,
  desc,
  disabled,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
        active && !disabled
          ? 'border-curator-accent bg-curator-accent/10'
          : 'border-curator-border bg-curator-surface',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:border-curator-accent/50 cursor-pointer',
      )}
    >
      <span className="shrink-0 text-curator-muted">{icon}</span>
      <div>
        <p
          className={cn(
            'text-sm font-medium',
            active && !disabled ? 'text-curator-text' : 'text-curator-muted',
          )}
        >
          {title}
        </p>
        <p className="text-xs text-curator-muted mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function targetActiveClass(color: 'green' | 'red' | 'gray' | 'indigo'): string {
  switch (color) {
    case 'green':
      return 'border-green-500 bg-green-500/10 text-green-400';
    case 'red':
      return 'border-red-500 bg-red-500/10 text-red-400';
    case 'gray':
      return 'border-gray-500 bg-gray-500/10 text-gray-300';
    default:
      return 'border-indigo-500 bg-indigo-500/10 text-indigo-300';
  }
}
