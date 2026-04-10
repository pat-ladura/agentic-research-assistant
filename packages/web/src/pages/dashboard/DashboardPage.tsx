import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { researchApi } from '@/api/research.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, History } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: researchApi.getSessions,
  });

  const recent = sessions.slice(0, 5);
  const completed = sessions.filter((s: any) => s.status === 'completed').length;
  const usedProviders = [...new Set(sessions.map((s: any) => s.provider))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.firstName}</h1>
        <p className="text-muted-foreground">What do you want to research today?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sessions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Providers Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {usedProviders.length > 0
                ? usedProviders.map((p: any) => (
                    <Badge key={p} variant="outline">{p}</Badge>
                  ))
                : <span className="text-sm text-muted-foreground">None yet</span>
              }
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Link to="/research/new">
          <Button>
            <FlaskConical className="mr-2 h-4 w-4" />
            New Research
          </Button>
        </Link>
        <Link to="/sessions">
          <Button variant="outline">
            <History className="mr-2 h-4 w-4" />
            View History
          </Button>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Sessions</h2>
          {recent.map((session: any) => (
            <Link key={session.id} to={`/sessions/${session.id}`} className="block">
              <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-3">
                  <p className="text-sm font-medium">{session.title}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">{session.provider}</Badge>
                    <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
