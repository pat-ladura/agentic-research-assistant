import { useParams, useSearchParams, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { researchApi } from '@/api/research.api';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useReactToPrint } from 'react-to-print';
import { useSSE } from '@/hooks/useSSE';
import { StepProgress } from '@/components/research/StepProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CircleDot, Printer } from 'lucide-react';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const queryClient = useQueryClient();
  const { events, status, report, failedEvent } = useSSE(jobId ?? null);

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => researchApi.getSession(Number(sessionId)),
    enabled: !!sessionId,
  });

  // Invalidate session query when job completes so SessionDetailPage refreshes
  useEffect(() => {
    if ((status === 'complete' || status === 'failed') && sessionId) {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    }
  }, [status, sessionId, queryClient]);

  const isComplete = status === 'complete' || status === 'failed';
  const title = status === 'complete' ? 'Research Complete' : 'Research in Progress';

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {sessionId && (
          <Button variant="link" size="sm" className="px-0" render={<Link to={'/sessions'} />}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Session
          </Button>
        )}
      </div>

      {!isLoading && (
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          {!isComplete && (
            <Badge variant="secondary" className={status === 'live' ? 'bg-red-500 text-white' : ''}>
              {status === 'live' && <CircleDot className="animate-pulse" />}
              {status === 'live' ? 'Live' : isComplete ? 'Complete' : 'Connecting...'}
            </Badge>
          )}
        </div>
      )}

      <StepProgress events={events} status={status} />

      {report && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Research Report</CardTitle>
            <Button
              variant="outline"
              className="cursor-pointer"
              size="sm"
              onClick={() => handlePrint()}
            >
              <Printer className="mr-1 h-4 w-4" />
              Print / Save PDF
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-125 pr-4">
              <div ref={printRef} style={{ padding: '20px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
                  {session?.title ?? title}
                </h1>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {failedEvent && (
        <Card className="border-destructive">
          <CardContent>
            <p className="text-sm text-destructive">Research failed: {failedEvent.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
