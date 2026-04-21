import { NavLink, useNavigate } from 'react-router';
import { useRef, useState, useEffect } from 'react';
import { LayoutDashboard, FlaskConical, History, LogOut, BotMessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/research/new', label: 'New Research', icon: FlaskConical },
  { to: '/sessions', label: 'History', icon: History },
];

function ProfileDropdown() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : '?';
  const fullName = user ? `${user.firstName} ${user.lastName}` : '';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await authApi.logout().catch(() => {});
    clearAuth();
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Open profile menu"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-popover shadow-md z-50">
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="border-t px-2 py-2">
            <button
              onClick={handleLogout}
              className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-60 flex-col border-r bg-muted/30 p-4">
        <div className="flex flex-row mb-6">
          <div className="mr-2">
            <BotMessageSquare size={40} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AGENTIC</h1>
            <p className="text-xs text-muted-foreground -mt-1.25">Research Assistant</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-md transition-colors h-10',
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
      </aside>
      <main className="flex-1 flex flex-col">
        <div className="flex items-center border-b bg-muted/30 px-4 py-3">
          {/* Profile */}
          <ProfileDropdown />
        </div>
        <div className="content p-6 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
