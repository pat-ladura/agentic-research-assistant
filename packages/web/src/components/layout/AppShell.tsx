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
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
