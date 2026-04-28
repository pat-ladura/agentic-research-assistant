import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { researchApi } from '@/api/research.api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SessionCard } from '@/components/sessions/SessionCard';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data = { sessions: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    isLoading,
  } = useQuery({
    queryKey: ['sessions', page, debouncedSearch],
    queryFn: () => researchApi.getSessions({ page, search: debouncedSearch || undefined }),
    refetchInterval: (query) => {
      const sessions = query.state.data?.sessions ?? [];
      return sessions.some((s: any) => s.status === 'pending' || s.status === 'running')
        ? 5000
        : false;
    },
  });

  // Debounce search 300ms
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      if (page > 1) setPage(1); // Reset to page 1 on search change only if needed
    }, 400);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [search]);

  // Auto-focus input after query completes
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const { sessions, pagination } = data;

  const handlePrevPage = () => {
    if (pagination.page > 1) setPage(pagination.page - 1);
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) setPage(pagination.page + 1);
  };

  if (isLoading) return <div className="text-muted-foreground">Loading sessions...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Research History</h1>
      </div>

      <Input
        ref={inputRef}
        placeholder="Search by title or query..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm h-10"
      />

      {sessions.length === 0 && (
        <p className="text-muted-foreground">No research sessions found.</p>
      )}

      <div className="space-y-3">
        {sessions.map((session: any) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            onClick={handlePrevPage}
            disabled={pagination.page === 1}
            variant="outline"
            className="cursor-pointer"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            onClick={handleNextPage}
            disabled={pagination.page === pagination.totalPages}
            variant="outline"
            className="cursor-pointer"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
