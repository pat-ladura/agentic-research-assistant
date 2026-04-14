import { EventEmitter } from 'events';

// Unlimited — active listener count is tracked manually via activeJobStreams in the SSE route.
// Each job gets at most 1 listener (1 SSE connection per job guardrail).
export const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(0);

export interface JobProgressEvent {
  jobId: string;
  step: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: unknown;
}

export function emitJobProgress(event: JobProgressEvent): void {
  jobEmitter.emit(event.jobId, event);
}
