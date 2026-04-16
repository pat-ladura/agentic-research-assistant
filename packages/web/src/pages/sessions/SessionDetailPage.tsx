import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router';
import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { researchApi } from '@/api/research.api';
import { useSSE } from '@/hooks/useSSE';
import { StepProgress } from '@/components/research/StepProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft } from 'lucide-react';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => researchApi.getSession(Number(id)),
    enabled: !!id,
  });

  const isInProgress = session?.status === 'pending' || session?.status === 'processing';

  const { data: latestJob } = useQuery({
    queryKey: ['session-job', id],
    queryFn: () => researchApi.getSessionLatestJob(Number(id)),
    enabled: !!id && isInProgress,
  });

  const { events, status: sseStatus } = useSSE(isInProgress ? (latestJob?.jobId ?? null) : null);

  // When SSE completes, refresh the session to show the final result
  useEffect(() => {
    if (sseStatus === 'complete' || sseStatus === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
    }
  }, [sseStatus, id, queryClient]);

  if (isLoading) return <div className="text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="text-muted-foreground">Session not found.</div>;

  const showLiveProgress = isInProgress && (sseStatus === 'connecting' || sseStatus === 'live');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sessions">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
            {session.status}
          </Badge>
          <Badge variant="outline">{session.provider}</Badge>
        </div>
        {session.description && <p className="mt-1 text-muted-foreground">{session.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
        </p>
      </div>

      {showLiveProgress && <StepProgress events={events} />}

      {session.result && (
        <Card>
          <CardHeader>
            <CardTitle>Research Report</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.result}</ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!session.result && !showLiveProgress && session.status !== 'completed' && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Research is {session.status}. Results will appear here when completed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
