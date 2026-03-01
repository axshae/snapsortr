import { FilterTab } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../utils/cn';

const TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'taken', label: 'Taken' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'undecided', label: 'Undecided' },
];

export function FilterTabs() {
  const { activeFilter, setActiveFilter, images, selections } = useAppStore(
    useShallow((s) => ({
      activeFilter: s.activeFilter,
      setActiveFilter: s.setActiveFilter,
      images: s.images,
      selections: s.selections,
      currentDirectory: s.currentDirectory,
    })),
  );

  const stats = useAppStore(useShallow((s) => s.getStats()));

  const counts: Record<FilterTab, number> = {
    all: stats.total,
    taken: stats.taken,
    dropped: stats.dropped,
    undecided: stats.undecided,
  };

  // Suppress "unused variable" for images and selections — they trigger re-renders
  void images;
  void selections;

  return (
    <div className="flex items-center gap-1 bg-curator-surface rounded-lg p-1 border border-curator-border overflow-x-auto scrollbar-none shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => setActiveFilter(tab.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors whitespace-nowrap',
            activeFilter === tab.value
              ? tabActiveClass(tab.value)
              : 'text-curator-muted hover:text-curator-text',
          )}
        >
          {tab.label}
          <span
            className={cn(
              'text-xs tabular-nums px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center',
              activeFilter === tab.value
                ? 'bg-white/20 text-white'
                : 'bg-curator-panel text-curator-muted',
            )}
          >
            {counts[tab.value]}
          </span>
        </button>
      ))}
    </div>
  );
}

function tabActiveClass(tab: FilterTab): string {
  switch (tab) {
    case 'taken':
      return 'bg-green-500/20 text-green-400';
    case 'dropped':
      return 'bg-red-500/20 text-red-400';
    case 'undecided':
      return 'bg-gray-500/20 text-gray-300';
    default:
      return 'bg-indigo-500/20 text-indigo-300';
  }
}
