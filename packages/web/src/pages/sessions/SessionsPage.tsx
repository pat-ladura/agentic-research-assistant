import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import { researchApi } from '@/api/research.api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/ui/provider-icon';

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

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-muted';
    }
  };

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
        {sessions.map((session) => (
          <Link key={session.id} to={`/sessions/${session.id}`} className="block">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{session.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ProviderIcon provider={session.provider} /> {session.provider}
                  </Badge>
                  <Badge variant="default" className={getBadgeColor(session.status)}>
                    {session.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
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
