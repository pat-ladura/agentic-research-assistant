import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProviderIcon } from '@/components/ui/provider-icon';
import { cn } from '@/lib/utils';

interface Session {
  id: string;
  title: string;
  createdAt: string;
  researchJob?: {
    pgBossJobId: string;
  };
  provider: string;
  status: string;
  opened?: boolean;
}

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const isUnread =
    session.opened === false &&
    (session.status === 'completed' || session.status === 'failed');

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
      <Card
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/50',
          isUnread && session.status === 'completed' && 'ring-2 ring-green-500',
          isUnread && session.status === 'failed' && 'ring-2 ring-red-500'
        )}
      >
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
            {isUnread && (
              <Badge
                variant="default"
                className={
                  session.status === 'completed'
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white'
                }
              >
                New
              </Badge>
            )}
            <Badge variant="default" className={getBadgeColor(session.status)}>
              {session.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
