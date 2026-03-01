import { Check } from 'lucide-react';
import { cn } from '../utils/cn';

interface WizardProgressProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { number: 1, label: 'Select Folder' },
  { number: 2, label: 'Review Images' },
  { number: 3, label: 'Export' },
] as const;

export function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <div className="flex items-center gap-0 select-none">
      {STEPS.map((step, i) => {
        const isDone = step.number < currentStep;
        const isActive = step.number === currentStep;
        return (
          <div key={step.number} className="flex items-center">
            {/* Step bubble */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                  isDone &&
                    'bg-curator-taken border-curator-taken text-white',
                  isActive &&
                    'bg-curator-accent border-curator-accent text-white',
                  !isDone &&
                    !isActive &&
                    'bg-transparent border-curator-border text-curator-muted',
                )}
              >
                {isDone ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  'text-sm font-medium transition-colors hidden sm:block',
                  isActive ? 'text-curator-text' : 'text-curator-muted',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-8 sm:w-16 h-0.5 mx-2 transition-colors',
                  isDone ? 'bg-curator-taken' : 'bg-curator-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
