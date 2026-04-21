import { useParams, useSearchParams, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSSE } from '@/hooks/useSSE';
import { StepProgress } from '@/components/research/StepProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CircleDot } from 'lucide-react';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const queryClient = useQueryClient();
  const { events, status, report, failedEvent } = useSSE(jobId ?? null);

  // Invalidate session query when job completes so SessionDetailPage refreshes
  useEffect(() => {
    if ((status === 'complete' || status === 'failed') && sessionId) {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    }
  }, [status, sessionId, queryClient]);

  const isComplete = status === 'complete' || status === 'failed';
  const title = status === 'complete' ? 'Research Complete' : 'Research in Progress';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {sessionId && (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            render={<Link to={`/sessions/${sessionId}`} />}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Session
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Badge variant="default" className={status === 'live' ? 'bg-red-500' : ''}>
          {status === 'live' && <CircleDot />}
          {status === 'live' ? 'Live' : isComplete ? 'Complete' : 'Connecting...'}
        </Badge>
      </div>

      <StepProgress events={events} />

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Research Report</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-125 pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {failedEvent && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Research failed: {failedEvent.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
