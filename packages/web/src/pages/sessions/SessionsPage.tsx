import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { researchApi } from '@/api/research.api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProviderIcon } from '@/components/ui/provider-icon';

export default function SessionsPage() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: researchApi.getSessions,
  });

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

  if (isLoading) return <div className="text-muted-foreground">Loading sessions...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Research History</h1>
      {sessions.length === 0 && <p className="text-muted-foreground">No research sessions yet.</p>}
      <div className="space-y-3">
        {sessions.map((session) => (
          <Link key={session.id} to={`/sessions/${session.id}`} className="block">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
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
    </div>
  );
}
