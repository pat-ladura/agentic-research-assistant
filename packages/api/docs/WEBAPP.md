# Agentic Research Assistant — Web App Implementation Plan

This document is structured for an AI agent to follow phase by phase.
Each phase is self-contained with exact commands, file structures, and validation criteria.
Do NOT proceed to the next phase until the current phase is validated.

---

## Project Context

- **API base URL**: `http://localhost:3005/api` (Express backend — see AGENTS.md)
- **Auth**: JWT Bearer token (`Authorization: Bearer <token>`) + API Key (`x-api-key` header) on every request
- **Real-time**: SSE via native `EventSource` — `GET /api/research/jobs/:id/stream`
- **Providers**: user selects `openai`, `gemini`, or `ollama` per research session
- **Framework**: React 19, TypeScript, Vite
- **Router**: React Router v7
- **Styles**: Tailwind CSS v4 + shadcn/ui
- **State**: TanStack Query v5 (server state), Zustand (auth + UI state)
- **HTTP client**: `ky` (lightweight fetch wrapper)

---

## Phase 1 — Project Scaffold

### Objective

Bootstrap the Vite + React + TypeScript project, install all dependencies, configure Tailwind and shadcn/ui.

### Commands

```bash
# 1. Scaffold (run from hackathon/ directory, sibling to the API)
pnpm create vite@latest agentic-research-assistant-web -- --template react-ts
cd agentic-research-assistant-web

# 2. Core dependencies
pnpm add react-router ky @tanstack/react-query zustand

# 3. Tailwind CSS v4
pnpm add tailwindcss @tailwindcss/vite

# 4. shadcn/ui peer deps
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add -D @types/node

# 5. Init shadcn/ui
pnpm dlx shadcn@latest init
# When prompted:
#   Style: Default
#   Base color: Neutral
#   CSS variables: Yes
```

### `vite.config.ts` — add Tailwind plugin and path alias

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3005', // proxy to Express in dev
    },
  },
});
```

### `src/index.css` — Tailwind v4 import (replace entire file)

```css
@import 'tailwindcss';
```

### Validation

- `pnpm dev` starts without errors
- `http://localhost:5173` renders Vite default page
- Tailwind classes apply (add `className="text-red-500"` to App.tsx temporarily)
- shadcn/ui `components.json` exists at project root

---

## Phase 2 — Project Structure + Routing

### Objective

Set up folder structure, React Router, and lazy-loaded routes before building any pages.

### Directory structure to create

```
src/
  api/           # ky HTTP client + typed request functions
  components/
    ui/          # shadcn/ui generated components go here
    layout/      # AppShell, Sidebar, Header, ProtectedRoute
  hooks/         # custom hooks (useSSE, useAuth, useResearch)
  lib/           # utils, cn() helper
  pages/         # one file per route
    auth/
      LoginPage.tsx
    dashboard/
      DashboardPage.tsx
    sessions/
      SessionsPage.tsx
      SessionDetailPage.tsx
    research/
      NewResearchPage.tsx
      JobDetailPage.tsx
  store/         # Zustand stores
    auth.store.ts
  types/         # API response types
    index.ts
  main.tsx
  App.tsx
```

### `src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### `src/App.tsx` — router with lazy loading

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const SessionsPage = lazy(() => import('@/pages/sessions/SessionsPage'));
const SessionDetailPage = lazy(() => import('@/pages/sessions/SessionDetailPage'));
const NewResearchPage = lazy(() => import('@/pages/research/NewResearchPage'));
const JobDetailPage = lazy(() => import('@/pages/research/JobDetailPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense
          fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/research/new" element={<NewResearchPage />} />
              <Route path="/research/jobs/:jobId" element={<JobDetailPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### `src/store/auth.store.ts`

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: { id: number; email: string; firstName: string; lastName: string } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'auth' }
  )
);
```

### `src/components/layout/ProtectedRoute.tsx`

```tsx
import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/store/auth.store';
import AppShell from './AppShell';

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
```

### Validation

- All routes render placeholder `<div>` pages without errors
- `/login` renders without auth; any other route redirects to `/login`
- Zustand auth state persists in localStorage across refresh

---

## Phase 3 — HTTP Client + API Types

### Objective

Set up a typed `ky` client that automatically attaches JWT and API key headers.

### `src/api/client.ts`

```ts
import ky from 'ky';
import { useAuthStore } from '@/store/auth.store';

const API_KEY = import.meta.env.VITE_API_KEY;

export const apiClient = ky.create({
  prefixUrl: '/api',
  hooks: {
    beforeRequest: [
      (request) => {
        const token = useAuthStore.getState().token;
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
        if (API_KEY) request.headers.set('x-api-key', API_KEY);
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          useAuthStore.getState().clearAuth();
          window.location.href = '/login';
        }
      },
    ],
  },
});
```

### `src/types/index.ts` — API response types

```ts
export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ResearchSession {
  id: number;
  userId: number;
  title: string;
  description?: string;
  provider: 'openai' | 'gemini' | 'ollama';
  embeddingModel: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchJob {
  id: number;
  sessionId: number;
  pgBossJobId: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
}

export interface JobProgressEvent {
  jobId: string;
  step: 'decompose' | 'search' | 'summarize' | 'synthesize' | 'agent';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: {
    subQuestions?: string;
    searchQueries?: string;
    summaries?: string;
    report?: string;
  };
}
```

### `src/api/auth.api.ts`

```ts
import { apiClient } from './client';
import type { AuthResponse } from '@/types';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('auth/login', { json: { email, password } }).json<AuthResponse>(),

  logout: () => apiClient.post('auth/logout').json<{ message: string }>(),
};
```

### `src/api/research.api.ts`

```ts
import { apiClient } from './client';
import type { ResearchSession, ResearchJob } from '@/types';

export const researchApi = {
  getSessions: () => apiClient.get('research/sessions').json<ResearchSession[]>(),

  createSession: (data: { title: string; description?: string; provider: string }) =>
    apiClient.post('research/sessions', { json: data }).json<ResearchSession>(),

  getSession: (id: number) => apiClient.get(`research/sessions/${id}`).json<ResearchSession>(),

  submitQuery: (sessionId: number, query: string, provider: string) =>
    apiClient
      .post('research/query', { json: { sessionId, query, provider } })
      .json<{ jobId: string; sessionId: number; status: string }>(),

  getJob: (jobId: string) => apiClient.get(`research/jobs/${jobId}`).json<ResearchJob>(),
};
```

### `.env.local`

```
VITE_API_KEY=oc69D9GfbFychh8d6h7rtDzo356jL47w
```

### Validation

- `apiClient` attaches `Authorization` and `x-api-key` headers on every request (confirm in browser DevTools Network tab)
- `authApi.login()` with valid credentials returns a token
- 401 response triggers redirect to `/login` and clears localStorage auth

---

## Phase 4 — Authentication Pages

### Objective

Build the login page. No registration — users are seeded directly in DB.

### shadcn/ui components to add

```bash
pnpm dlx shadcn@latest add card button input label form
```

### `src/pages/auth/LoginPage.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setAuth(res.token, res.user);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Research Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Validation

- Login form submits, JWT stored in localStorage
- Invalid credentials shows error message
- Successful login redirects to `/dashboard`
- Refreshing page stays on `/dashboard` (token persisted)

---

## Phase 5 — App Shell + Layout

### Objective

Build the persistent sidebar layout that wraps all authenticated pages.

### shadcn/ui components to add

```bash
pnpm dlx shadcn@latest add separator badge tooltip
```

### `src/components/layout/AppShell.tsx`

```tsx
import { NavLink, useNavigate } from 'react-router';
import { LayoutDashboard, FlaskConical, History, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/research/new', label: 'New Research', icon: FlaskConical },
  { to: '/sessions', label: 'History', icon: History },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Research AI</h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
```

### Validation

- Sidebar renders on all authenticated routes
- Active route is highlighted
- Sign Out clears token and redirects to `/login`
- Non-authenticated routes do not show sidebar

---

## Phase 6 — Research Pages (Core Feature)

### Objective

Build the New Research page (session + query form) and the Job Detail page (SSE live progress stream).

### shadcn/ui components to add

```bash
pnpm dlx shadcn@latest add select textarea progress alert scroll-area
```

### `src/hooks/useSSE.ts` — SSE hook

```ts
import { useEffect, useRef, useState } from 'react';
import type { JobProgressEvent } from '@/types';

export function useSSE(jobId: string | null) {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/research/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const event: JobProgressEvent = JSON.parse(e.data);
      setEvents((prev) => [...prev, event]);
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [jobId]);

  return { events, connected };
}
```

### `src/pages/research/NewResearchPage.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { researchApi } from '@/api/research.api';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI (GPT-4o)' },
  { value: 'gemini', label: 'Google Gemini 1.5 Pro' },
  { value: 'ollama', label: 'Ollama Cloud (llama3)' },
];

export default function NewResearchPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('openai');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // 1. Create session
      const session = await researchApi.createSession({ title, provider });
      // 2. Submit query, get jobId
      const { jobId } = await researchApi.submitQuery(session.id, query, provider);
      // 3. Navigate to job progress page
      navigate(`/research/jobs/${jobId}?sessionId=${session.id}`);
    } catch {
      setError('Failed to start research. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Research</h1>
        <p className="text-muted-foreground">
          Submit a research query and watch the agent work in real-time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Session Title</Label>
              <Input
                id="title"
                placeholder="e.g. Latest advances in quantum computing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="provider">AI Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                High-reasoning steps use the selected provider. Low-reasoning steps always use local
                Ollama.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="query">Research Query</Label>
              <Textarea
                id="query"
                placeholder="What do you want to research?"
                rows={4}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Starting...' : 'Start Research'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/pages/research/JobDetailPage.tsx` — live SSE progress

```tsx
import { useParams } from 'react-router';
import { useSSE } from '@/hooks/useSSE';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { JobProgressEvent } from '@/types';

const STEPS = ['decompose', 'search', 'summarize', 'synthesize'] as const;

const STEP_LABELS: Record<string, string> = {
  decompose: 'Decompose Query',
  search: 'Generate Search Queries',
  summarize: 'Summarize Sources',
  synthesize: 'Synthesize Report',
};

function StepStatus({ step, events }: { step: string; events: JobProgressEvent[] }) {
  const stepEvents = events.filter((e) => e.step === step);
  const latest = stepEvents.at(-1);

  const statusColor = {
    started: 'bg-yellow-500',
    progress: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={cn(
          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
          latest ? statusColor[latest.status] : 'bg-muted'
        )}
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
          {latest && (
            <Badge
              variant={latest.status === 'completed' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {latest.status}
            </Badge>
          )}
        </div>
        {latest && <p className="text-xs text-muted-foreground">{latest.message}</p>}
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { events, connected } = useSSE(jobId ?? null);

  const report = events.find((e) => e.step === 'synthesize' && e.status === 'completed')?.data
    ?.report;
  const failed = events.find((e) => e.status === 'failed');
  const isComplete = !!report || !!failed;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Research in Progress</h1>
        <Badge variant={connected ? 'default' : 'secondary'}>
          {connected ? 'Live' : isComplete ? 'Complete' : 'Connecting...'}
        </Badge>
      </div>

      {/* Step Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Steps</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {STEPS.map((step) => (
            <StepStatus key={step} step={step} events={events} />
          ))}
        </CardContent>
      </Card>

      {/* Final Report */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Research Report</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{report}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {failed && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Research failed: {failed.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### Validation

- Submit a research query — immediately navigates to `/research/jobs/:jobId`
- Step indicators turn yellow (started) → green (completed) in real time via SSE
- Summarize step completes visibly before Synthesize (confirms low-reason routing is working)
- Final report renders in a scrollable card after synthesize completes
- Closing the tab and reopening `/research/jobs/:jobId` falls back to polling (`GET /jobs/:id`) gracefully

---

## Phase 7 — Sessions History Page

### Objective

List past research sessions linked to the authenticated user.

### `src/pages/sessions/SessionsPage.tsx`

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { researchApi } from '@/api/research.api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export default function SessionsPage() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: researchApi.getSessions,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading sessions...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Research History</h1>
      {sessions.length === 0 && <p className="text-muted-foreground">No research sessions yet.</p>}
      <div className="space-y-3">
        {sessions.map((session) => (
          <Link key={session.id} to={`/sessions/${session.id}`}>
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{session.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
    </div>
  );
}
```

### Install date-fns

```bash
pnpm add date-fns
```

### Validation

- Sessions list renders after login
- Provider badge shows `openai` / `gemini` / `ollama`
- Status badge reflects `completed` / `running` / `failed`
- Clicking a session navigates to `/sessions/:id`

---

## Phase 8 — Dashboard Page

### Objective

Summary view: recent sessions, quick-start button, provider usage stats.

### `src/pages/dashboard/DashboardPage.tsx`

```tsx
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
  const completed = sessions.filter((s) => s.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.firstName}</h1>
        <p className="text-muted-foreground">What do you want to research today?</p>
      </div>

      {/* Stats */}
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
              Providers Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 flex-wrap">
              {[...new Set(sessions.map((s) => s.provider))].map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/research/new">
            <FlaskConical className="mr-2 h-4 w-4" />
            New Research
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/sessions">
            <History className="mr-2 h-4 w-4" />
            View History
          </Link>
        </Button>
      </div>

      {/* Recent sessions */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Sessions</h2>
          {recent.map((session) => (
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
```

### Validation

- Dashboard shows total/completed session counts
- Recent sessions list links correctly
- Quick-start button navigates to `/research/new`

---

## Cross-cutting Rules

1. **Never store the JWT in a cookie** — use Zustand + localStorage via `persist` middleware
2. **All API calls go through `apiClient`** — never use raw `fetch` or `axios`
3. **SSE uses native `EventSource`** — no wrapper library; clean up in `useEffect` return
4. **Never pass `sessionId` in the URL path for job creation** — use query params or component state to avoid leaking it
5. **Provider selection lives on the session** — the `NewResearchPage` sets it once; subsequent queries in the same session inherit the provider
6. **TanStack Query cache key convention**: `['sessions']`, `['session', id]`, `['job', jobId]` — be consistent across pages to benefit from shared cache invalidation
7. **shadcn/ui components are generated into `src/components/ui/`** — never edit them directly; customise via `className` props only
