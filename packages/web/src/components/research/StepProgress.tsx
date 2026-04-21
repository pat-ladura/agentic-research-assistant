import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { JobProgressEvent } from '@/types';

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
              className={latest.status === 'completed' ? 'bg-green-500' : ''}
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
}

export function StepProgress({ events }: StepProgressProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent Steps</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0 px-6">
        {STEPS.map((step) => (
          <StepRow key={step} step={step} events={events} />
        ))}
      </CardContent>
    </Card>
  );
}
