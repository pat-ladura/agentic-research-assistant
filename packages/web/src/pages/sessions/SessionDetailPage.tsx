import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { researchApi } from '@/api/research.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft } from 'lucide-react';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => researchApi.getSession(Number(id)),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="text-muted-foreground">Session not found.</div>;

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
        {session.description && (
          <p className="mt-1 text-muted-foreground">{session.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
        </p>
      </div>

      {session.result && (
        <Card>
          <CardHeader>
            <CardTitle>Research Report</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{session.result}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!session.result && session.status !== 'completed' && (
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
