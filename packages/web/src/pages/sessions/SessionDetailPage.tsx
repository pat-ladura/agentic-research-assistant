import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router';
import { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useReactToPrint } from 'react-to-print';
import { researchApi } from '@/api/research.api';
import { useSSE } from '@/hooks/useSSE';
import { StepProgress } from '@/components/research/StepProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, RefreshCw, Printer } from 'lucide-react';
import { ProviderIcon } from '@/components/ui/provider-icon';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => researchApi.getSession(Number(id)),
    enabled: !!id,
  });

  const isInProgress = session?.status === 'pending';

  const { data: latestJob } = useQuery({
    queryKey: ['session-job', id],
    queryFn: () => researchApi.getSessionLatestJob(Number(id)),
    enabled: !!id && isInProgress,
  });

  const { events, status: sseStatus } = useSSE(isInProgress ? (latestJob?.jobId ?? null) : null);

  const retryMutation = useMutation({
    mutationFn: () => researchApi.retrySession(Number(id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['session-job', id] });
      navigate(`/research/jobs/${data.jobId}?sessionId=${id}`);
    },
  });

  // When SSE completes, refresh the session to show the final result
  useEffect(() => {
    if (sseStatus === 'complete' || sseStatus === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
    }
  }, [sseStatus, id, queryClient]);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ documentTitle: session?.title, contentRef: printRef });

  if (isLoading) return <div className="text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="text-muted-foreground">Session not found.</div>;

  const showLiveProgress = isInProgress && (sseStatus === 'connecting' || sseStatus === 'live');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="link" size="sm" className="px-0" render={<Link to="/sessions" />}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <Badge
            variant="default"
            className={
              session.status === 'pending'
                ? 'bg-yellow-500'
                : session.status === 'completed'
                  ? 'bg-green-500'
                  : session.status === 'failed'
                    ? 'bg-red-500'
                    : ''
            }
          >
            {session.status}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <ProviderIcon provider={session.provider} /> {session.provider}
          </Badge>
          {session.status === 'failed' && (
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {retryMutation.isPending ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </div>
        {session.description && <p className="mt-1 text-muted-foreground">{session.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
        </p>
      </div>

      {showLiveProgress && <StepProgress events={events} status={sseStatus} />}

      {session.result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Research Report</CardTitle>
            <Button variant="outline" size="sm" onClick={() => handlePrint()}>
              <Printer className="mr-1 h-4 w-4" />
              Print / Save PDF
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-125 pr-4">
              <div ref={printRef} style={{ padding: '20px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
                  {session.title}
                </h1>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.result}</ReactMarkdown>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!session.result && !showLiveProgress && session.status !== 'completed' && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Research is {session.status}. Results will appear here when completed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
