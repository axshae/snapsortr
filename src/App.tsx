import logo from './assets/logo.png';
import { useAppStore } from './store/useAppStore';
import { WizardProgress } from './components/WizardProgress';
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

          {/* Spacer to mirror left side */}
          <div className="w-28 hidden sm:block" />
        </header>
      )}

      {/* ── Step content ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        {step === 'folder-selection' && <FolderSelection />}
        {step === 'image-review' && <ImageReview />}
        {step === 'export' && <ExportPanel />}
      </div>
    </div>
  );
}
