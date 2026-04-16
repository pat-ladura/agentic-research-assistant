import { useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useAuthStore } from '@/store/auth.store';
import type { JobProgressEvent } from '@/types';

const API_KEY = import.meta.env.VITE_API_KEY as string;

export type SSEStatus = 'idle' | 'connecting' | 'live' | 'complete' | 'failed';

export function useSSE(jobId: string | null) {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [status, setStatus] = useState<SSEStatus>('idle');
  const [report, setReport] = useState<string | undefined>(undefined);
  const [failedEvent, setFailedEvent] = useState<JobProgressEvent | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Reset state when jobId changes
    setEvents([]);
    setStatus('connecting');
    setReport(undefined);
    setFailedEvent(undefined);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const token = useAuthStore.getState().token;

    fetchEventSource(`/api/research/jobs/${jobId}/stream`, {
      signal: ctrl.signal,
      headers: {
        'x-api-key': API_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      onopen: async (res) => {
        if (res.ok) {
          setStatus('live');
        } else {
          throw new Error(`SSE open failed: ${res.status}`);
        }
      },
      onmessage: (msg) => {
        if (!msg.data) return;
        try {
          const event: JobProgressEvent = JSON.parse(msg.data);
          setEvents((prev) => [...prev, event]);

          if (event.step === 'synthesize' && event.status === 'completed') {
            setReport(event.data?.report);
            setStatus('complete');
          } else if (event.status === 'failed') {
            setFailedEvent(event);
            setStatus('failed');
          }
        } catch {
          // malformed frame — ignore
        }
      },
      onerror: () => {
        setStatus((prev) => (prev === 'complete' || prev === 'failed' ? prev : 'failed'));
        // Throw to stop automatic retry — server sends terminal event on job end
        throw new Error('SSE error');
      },
    });

    return () => {
      ctrl.abort();
    };
  }, [jobId]);

  return { events, status, report, failedEvent };
}
