import { useEffect, useRef, useState } from 'react';
import type { JobProgressEvent } from '@/types';

export function useSSE(jobId: string | null) {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/research/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const event: JobProgressEvent = JSON.parse(e.data as string);
      setEvents((prev) => [...prev, event]);
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [jobId]);

  return { events, connected };
}
