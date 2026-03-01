/**
 * DirectorySidebar
 *
 * Renders the recursive directory tree. Each node shows:
 *   - folder icon + name
 *   - total image count badge
 *   - quick stats (taken/dropped pct as a mini progress bar)
 */
import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { DirectoryNode } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../utils/cn';

interface DirectorySidebarProps {
  className?: string;
}

export function DirectorySidebar({ className }: DirectorySidebarProps) {
  const { directoryTree, currentDirectory, setCurrentDirectory } = useAppStore(
    useShallow((s) => ({
      directoryTree: s.directoryTree,
      currentDirectory: s.currentDirectory,
      setCurrentDirectory: s.setCurrentDirectory,
    })),
  );

  if (!directoryTree) return null;

  return (
    <aside
      className={cn(
        'flex flex-col bg-curator-surface border-r border-curator-border overflow-y-auto',
        className,
      )}
    >
      <div className="px-3 py-2 border-b border-curator-border">
        <p className="text-xs font-semibold uppercase tracking-widest text-curator-muted">
          Directories
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <TreeNode
          node={directoryTree}
          depth={0}
          currentDirectory={currentDirectory}
          onSelect={setCurrentDirectory}
          defaultOpen
        />
      </div>
    </aside>
  );
}

// ─── Recursive tree node ──────────────────────────────────────────────────────

interface TreeNodeProps {
  node: DirectoryNode;
  depth: number;
  currentDirectory: string;
  onSelect: (path: string) => void;
  defaultOpen?: boolean;
}

function TreeNode({
  node,
  depth,
  currentDirectory,
  onSelect,
  defaultOpen = false,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen || depth === 0);
  const isSelected = currentDirectory === node.path;
  const stats = useAppStore(useShallow((s) => s.getDirectoryStats(node.path)));

  const takenPct = stats.total > 0 ? (stats.taken / stats.total) * 100 : 0;
  const droppedPct = stats.total > 0 ? (stats.dropped / stats.total) * 100 : 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer group transition-colors select-none',
          'hover:bg-curator-panel',
          isSelected && 'bg-curator-panel text-curator-text',
          !isSelected && 'text-curator-muted',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.path)}
      >
        {/* Expand / collapse chevron */}
        {node.children.length > 0 ? (
          <button
            className="w-4 h-4 flex items-center justify-center shrink-0 text-curator-muted hover:text-curator-text"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <ChevronRight
              size={12}
              strokeWidth={2.5}
              className={cn('transition-transform', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Folder icon */}
        {open && node.children.length > 0 ? (
          <FolderOpen size={16} className="shrink-0 text-yellow-500/80" />
        ) : (
          <Folder size={16} className="shrink-0 text-yellow-500/80" />
        )}

        {/* Name */}
        <span
          className={cn(
            'text-sm truncate flex-1 min-w-0',
            isSelected && 'text-curator-text font-medium',
          )}
        >
          {node.name}
        </span>

        {/* Count badge */}
        <span className="text-xs text-curator-muted shrink-0 tabular-nums">
          {node.totalImageCount}
        </span>
      </div>

      {/* Mini progress bar */}
      {isSelected && stats.total > 0 && (
        <div
          className="h-0.5 mx-2 rounded-full overflow-hidden bg-curator-border"
          style={{ marginLeft: `${depth * 12 + 8}px` }}
        >
          <div className="h-full flex">
            <div
              className="bg-curator-taken h-full transition-all"
              style={{ width: `${takenPct}%` }}
            />
            <div
              className="bg-curator-dropped h-full transition-all"
              style={{ width: `${droppedPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Children */}
      {open && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentDirectory={currentDirectory}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
