import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { JobProgressEvent } from '@/types';
import type { SSEStatus } from '@/hooks/useSSE';

export const STEPS = ['decompose', 'search', 'summarize', 'synthesize'] as const;

export const STEP_LABELS: Record<string, string> = {
  decompose: 'Decompose Query',
  search: 'Generate Search Queries',
  summarize: 'Summarize Sources',
  synthesize: 'Synthesize Report',
};

export const STEP_HINTS: Record<string, string> = {
  decompose: 'High-reason → selected provider',
  search: 'High-reason → selected provider',
  summarize: 'Low-reason → local Ollama',
  synthesize: 'High-reason → selected provider',
};

function StepRow({ step, events }: { step: string; events: JobProgressEvent[] }) {
  const stepEvents = events.filter((e) => e.step === step);
  const latest = stepEvents.at(-1);

  const dotColor = latest
    ? {
        started: 'bg-yellow-500 animate-pulse',
        progress: 'bg-blue-500 animate-pulse',
        completed: 'bg-green-500',
        failed: 'bg-red-500',
      }[latest.status]
    : 'bg-muted';

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dotColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
          <span className="text-xs text-muted-foreground">{STEP_HINTS[step]}</span>
          {latest && (
            <Badge
              variant="secondary"
              className={latest.status === 'completed' ? 'bg-green-500 text-white' : ''}
            >
              {latest.status}
            </Badge>
          )}
        </div>
        {latest && <p className="text-xs text-muted-foreground mt-0.5">{latest.message}</p>}
      </div>
    </div>
  );
}

interface StepProgressProps {
  events: JobProgressEvent[];
  status?: SSEStatus;
}

export function StepProgress({ events, status }: StepProgressProps) {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    if (status === 'complete' || status === 'failed') {
      setIsOpen(false);
    } else if (status === 'connecting' || status === 'live') {
      setIsOpen(true);
    }
  }, [status]);

  const completedCount = STEPS.filter((step) => {
    const stepEvents = events.filter((e) => e.step === step);
    return stepEvents.at(-1)?.status === 'completed';
  }).length;

  const activeStep = STEPS.find((step) => {
    const latest = events.filter((e) => e.step === step).at(-1);
    return latest?.status === 'started' || latest?.status === 'progress';
  });

  const hasFailed = STEPS.some((step) => {
    return events.filter((e) => e.step === step).at(-1)?.status === 'failed';
  });

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsOpen((prev) => !prev)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Agent Steps</CardTitle>
          <div className="flex items-center gap-3">
            {!isOpen && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {STEPS.map((step) => {
                    const latest = events.filter((e) => e.step === step).at(-1);
                    const dotColor = latest
                      ? {
                          started: 'bg-yellow-500',
                          progress: 'bg-blue-500',
                          completed: 'bg-green-500',
                          failed: 'bg-red-500',
                        }[latest.status]
                      : 'bg-muted';
                    return (
                      <div
                        key={step}
                        className={cn('h-2 w-2 rounded-full', dotColor)}
                        title={STEP_LABELS[step]}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-muted-foreground">
                  {hasFailed ? (
                    <span className="text-red-500">Failed</span>
                  ) : (
                    `${completedCount} / ${STEPS.length} steps`
                  )}
                </span>
                {activeStep && !hasFailed && (
                  <span className="text-xs text-muted-foreground">· {STEP_LABELS[activeStep]}</span>
                )}
              </div>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="divide-y p-0 px-6">
          {STEPS.map((step) => (
            <StepRow key={step} step={step} events={events} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
