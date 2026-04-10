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
