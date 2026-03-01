import { useState } from 'react';
import { History, Github } from 'lucide-react';
import logo from './assets/logo.png';
import { useAppStore } from './store/useAppStore';
import { WizardProgress } from './components/WizardProgress';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { FolderSelection } from './features/folder-selection/FolderSelection';
import { ImageReview } from './features/image-review/ImageReview';
import { ExportPanel } from './features/export/ExportPanel';

const STEP_NUMBER: Record<string, 1 | 2 | 3> = {
  'folder-selection': 1,
  'image-review': 2,
  export: 3,
};

export default function App() {
  const step = useAppStore((s) => s.step);
  const sessionCount = useAppStore((s) => s.sessions.length);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-curator-bg text-curator-text">
      {/* ── Wizard header (only shown on steps 1 & 3, hidden in review for max space) */}
      {step !== 'image-review' && (
        <header className="flex items-center justify-between px-6 py-3 border-b border-curator-border bg-curator-surface shrink-0">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <img
              src={logo}
              alt="SnapSortr logo"
              className="w-7 h-7 rounded-lg bg-curator-accent object-contain p-1"
              draggable={false}
            />
            <span className="text-sm font-bold text-curator-text hidden sm:block font-display tracking-tight">
              SnapSortr
            </span>
          </div>

          <WizardProgress currentStep={STEP_NUMBER[step] ?? 1} />

          {/* History button */}
          <div className="w-28 hidden sm:flex justify-end gap-2">
            <a
              href="https://github.com/axshae/snapsortr"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub repository"
              className="btn-icon"
            >
              <Github size={16} />
            </a>
            <button
              onClick={() => setDrawerOpen(true)}
              title="Session History"
              className="relative btn-icon"
            >
              <History size={16} />
              {sessionCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-curator-accent text-[9px] font-bold text-white flex items-center justify-center leading-none">
                  {sessionCount > 9 ? '9+' : sessionCount}
                </span>
              )}
            </button>
          </div>
        </header>
      )}

      <SessionHistoryDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ── Step content ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        {step === 'folder-selection' && <FolderSelection />}
        {step === 'image-review' && <ImageReview />}
        {step === 'export' && <ExportPanel />}
      </div>
    </div>
  );
}
