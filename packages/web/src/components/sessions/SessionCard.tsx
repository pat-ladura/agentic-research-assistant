import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProviderIcon } from '@/components/ui/provider-icon';

interface Session {
  id: string;
  title: string;
  createdAt: string;
  researchJob?: {
    pgBossJobId: string;
  };
  provider: string;
  status: string;
}

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      case 'running':
        return 'bg-blue-500';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Link
      key={session.id}
      to={
        session.status === 'completed' || session.status === 'failed'
          ? `/sessions/${session.id}`
          : `/research/jobs/${session.researchJob?.pgBossJobId}?sessionId=${session.id}`
      }
      className="block"
    >
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
  );
}
