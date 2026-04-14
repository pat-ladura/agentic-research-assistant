import { useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useAuthStore } from '@/store/auth.store';
import type { JobProgressEvent } from '@/types';

const API_KEY = import.meta.env.VITE_API_KEY as string;

export function useSSE(jobId: string | null) {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [connected, setConnected] = useState(false);
  // AbortController lets us cleanly cancel the fetch-based SSE on unmount
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!jobId) return;

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
          setConnected(true);
        } else {
          // Non-2xx — throw so onerror fires
          throw new Error(`SSE open failed: ${res.status}`);
        }
      },
      onmessage: (msg) => {
        // Skip heartbeat comment lines (empty data)
        if (!msg.data) return;
        try {
          const event: JobProgressEvent = JSON.parse(msg.data);
          setEvents((prev) => [...prev, event]);
        } catch {
          // malformed frame — ignore
        }
      },
      onerror: () => {
        setConnected(false);
        // Throw to stop automatic retry — the server sends a terminal event on job end
        throw new Error('SSE error');
      },
    });

    return () => {
      ctrl.abort();
      setConnected(false);
    };
  }, [jobId]);

  return { events, connected };
}
