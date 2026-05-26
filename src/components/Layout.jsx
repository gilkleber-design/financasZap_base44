import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, MessageSquare, TrendingUp, Settings, Wallet, CalendarDays, Building2, Menu, X, CreditCard, LogOut, UserCircle, Target, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import DashboardLogo from '@/components/dashboard/DashboardLogo';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calendario', label: 'Calendário', icon: CalendarDays },
  { path: '/hospitais', label: 'Hospitais', icon: Building2 },
  { path: '/transacoes', label: 'Transações', icon: Wallet },
  { path: '/contas-pagar', label: 'A Pagar', icon: ArrowDownCircle },
  { path: '/contas-receber', label: 'A Receber', icon: ArrowUpCircle },
  { path: '/faturas-cartao', label: 'Faturas Cartão', icon: CreditCard },
  { path: '/planejamento', label: 'Planejamento', icon: Target },
  { path: '/hub-amarracao', label: 'Amarrações', icon: Link2 },
  { path: '/relatorios', label: 'Relatórios', icon: TrendingUp },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-50">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <DashboardLogo className="w-9 h-9" />
            <div>
              <h1 className="font-sora font-bold text-white text-lg leading-none"><span>Finanças</span><span className="text-primary">Zap</span></h1>
              <p className="text-xs text-sidebar-foreground/70 mt-0.5">Controle Financeiro</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                location.pathname === path
                  ? 'bg-sidebar-primary text-white'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-3 mb-2">
            <UserCircle className="w-8 h-8 text-sidebar-foreground/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Usuário'}</p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <DashboardLogo className="w-7 h-7" />
          <span className="font-sora font-bold text-white text-base"><span>Finanças</span><span className="text-primary">Zap</span></span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white p-1"
          aria-label="Abrir menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Mobile Side Dock Overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Drawer */}
          <aside
            className="relative ml-auto w-72 h-full bg-sidebar flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <DashboardLogo className="w-8 h-8" />
                <span className="font-sora font-bold text-white text-base"><span>Finanças</span><span className="text-primary">Zap</span></span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-sidebar-foreground/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150',
                    location.pathname === path
                      ? 'bg-sidebar-primary text-white'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t border-sidebar-border">
              <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-3 mb-2">
                <UserCircle className="w-8 h-8 text-sidebar-foreground/70 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Usuário'}</p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">{user?.email || ''}</p>
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}