import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { researchApi } from '@/api/research.api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProviderIcon } from '@/components/ui/provider-icon';
import { FlaskConical, History } from 'lucide-react';
import { SessionCard } from '@/components/sessions/SessionCard';

const PROVIDERS = ['openai', 'gemini', 'ollama'];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const {
    data = { sessions: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => researchApi.getSessions({ pageSize: 100 }),
  });

  const { sessions } = data;
  const recent = sessions.slice(0, 5);
  const completed = sessions.filter((s: any) => s.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.firstName}</h1>
        <p className="text-muted-foreground">What do you want to research today?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sessions
            </CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Providers Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {PROVIDERS.length > 0 ? (
                PROVIDERS.map((p: any) => (
                  <Badge
                    key={p}
                    variant="outline"
                    className="flex items-center gap-1 text-[14px] p-3"
                  >
                    <ProviderIcon provider={p} />
                    {p}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">None yet</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Link to="/research/new">
          <Button className="cursor-pointer">
            <FlaskConical className="h-4 w-4" />
            New Research
          </Button>
        </Link>
        <Link to="/sessions">
          <Button variant="outline" className="cursor-pointer">
            <History className="h-4 w-4" />
            View History
          </Button>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Sessions</h2>
          {recent.map((session: any) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
