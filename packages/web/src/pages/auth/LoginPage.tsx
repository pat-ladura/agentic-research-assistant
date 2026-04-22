import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { BotMessageSquare } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      if (!res.success && res.error) {
        // Display the error message from API response
        setError(res.error.message);
      } else if (res.success && res.data) {
        setAuth(res.data.token, res.data.user);
        navigate('/dashboard');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-3">
        <CardHeader className="text-center py-8">
          <CardTitle className="flex justify-center text-primary">
            <BotMessageSquare size={60} />
          </CardTitle>
          <CardTitle className="text-4xl tracking-widest">AGENTIC</CardTitle>
          <CardTitle className="text-md font-normal -mt-1.25">RESEARCH ASSISTANT</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mb-5">
            <div className="space-y-1">
              <Label htmlFor="email" className="font-normal">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                className="h-10"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="font-normal">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                className="h-10"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
