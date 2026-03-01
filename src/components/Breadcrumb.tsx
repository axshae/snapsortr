import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { getAncestors } from '../utils/imageUtils';
import { cn } from '../utils/cn';

export function Breadcrumb() {
  const { currentDirectory, rootName, setCurrentDirectory } = useAppStore(
    useShallow((s) => ({
      currentDirectory: s.currentDirectory,
      rootName: s.rootName,
      setCurrentDirectory: s.setCurrentDirectory,
    })),
  );

  const crumbs = getAncestors(currentDirectory, rootName);

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-none py-1">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <div key={crumb.path} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <span className="text-curator-border select-none">/</span>
            )}
            {isLast ? (
              <span className="text-curator-text font-medium truncate max-w-[160px]">
                {crumb.name}
              </span>
            ) : (
              <button
                onClick={() => setCurrentDirectory(crumb.path)}
                className={cn(
                  'text-curator-muted hover:text-curator-text transition-colors truncate max-w-[120px]',
                  'hover:underline underline-offset-2',
                )}
              >
                {crumb.name}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
