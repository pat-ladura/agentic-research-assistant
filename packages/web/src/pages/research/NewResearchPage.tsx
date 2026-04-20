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
  { value: 'openai', label: 'OpenAI (gpt-4o-mini)' },
  { value: 'gemini', label: 'Google Gemini 2.5 Flash' },
  { value: 'ollama', label: 'Ollama Cloud (qwen3.5:397b)' },
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
      const session = await researchApi.createSession({ title, provider });
      const { jobId } = await researchApi.submitQuery(session.id, query, provider);
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
                className="h-10"
                placeholder="e.g. Latest advances in quantum computing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="provider">AI Provider</Label>
              <Select value={provider} onValueChange={(v) => v !== null && setProvider(v)}>
                <SelectTrigger id="provider" className="h-10! cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="py-2 px-2 w-full">
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} className="cursor-pointer" value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                High-reasoning steps use the selected provider. Summarization always uses local
                Ollama.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="query">Research Query</Label>
              <Textarea
                id="query"
                className="h-24"
                placeholder="What do you want to research?"
                rows={4}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? 'Starting...' : 'Start Research'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
