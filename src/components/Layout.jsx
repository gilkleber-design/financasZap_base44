import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutGrid, 
  Stethoscope, 
  Wallet, 
  ReceiptText, 
  PieChart, 
  Target,
  ClipboardCheck,
  ArrowLeftRight,
  Settings, 
  Menu, 
  X, 
  LogOut, 
  UserCircle, 
  Plus,
  Link2,
  ShoppingBag,
  Repeat
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import DashboardLogo from '@/components/dashboard/DashboardLogo';

const navItems = [
  { path: '/', label: 'Início', icon: LayoutGrid },
  { path: '/calendario', label: 'Plantões', icon: Stethoscope },
  { path: '/receitas-recorrentes', label: 'Recorrentes', icon: Repeat },
  { path: '/recebimentos', label: 'Recebíveis', icon: Wallet },
  { path: '/contas-pagar', label: 'Contas', icon: ReceiptText },
  { path: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { path: '/compras', label: 'Compras', icon: ShoppingBag },
  { path: '/relatorios', label: 'Relatórios', icon: PieChart },
  { path: '/planejamento', label: 'Planej.', icon: Target },
  { path: '/revisao-dados', label: 'Revisão', icon: ClipboardCheck, adminOnly: true },
  { path: '/hub-amarracao', label: 'Amarração', icon: Link2, adminOnly: true },
];

const mobileNavItems = [
  { path: '/', label: 'Início', icon: LayoutGrid },
  { path: '/recebimentos', label: 'Recebíveis', icon: Wallet },
  { path: '/contas-pagar', label: 'Contas', icon: ReceiptText },
  { path: '/configuracoes', label: 'Config', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="flex min-h-screen bg-background">
      
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-24 flex-col items-center bg-[#0D3B66] py-4 text-white overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <Link to="/" className="mb-6 flex shrink-0 h-[68px] w-[68px] items-center justify-center rounded-xl text-white">
          <DashboardLogo className="h-[53px] w-[53px]" />
        </Link>

        <nav className="flex flex-1 flex-col items-center gap-4 w-full">
          {navItems.filter(item => !item.adminOnly || isAdmin).map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link key={path} to={path} className="flex shrink-0 flex-col items-center gap-1.5 text-center">
                <span className={cn(
                  'flex h-[68px] w-[68px] items-center justify-center rounded-[12px] transition-colors',
                  active 
                    ? 'bg-[rgba(15,163,163,0.25)] text-[#0FA3A3]' 
                    : 'text-[rgba(255,255,255,0.45)] hover:bg-white/10 hover:text-white'
                )}>
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="text-[10px] font-bold tracking-[0.02em] text-inherit">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 flex shrink-0 flex-col items-center gap-4">
          <Link to="/configuracoes" className="flex shrink-0 flex-col items-center gap-1.5 text-center text-[rgba(255,255,255,0.45)] hover:text-white">
            <span className={cn(
              'flex h-[68px] w-[68px] items-center justify-center rounded-[12px] transition-colors',
              location.pathname === '/configuracoes' 
                ? 'bg-[rgba(15,163,163,0.25)] text-[#0FA3A3]' 
                : 'hover:bg-white/10'
            )}>
              <Settings className="h-7 w-7" strokeWidth={1.75} />
            </span>
          </Link>
          <button 
            onClick={() => logout()} 
            className="flex shrink-0 h-[68px] w-[68px] items-center justify-center rounded-[12px] text-[rgba(255,255,255,0.45)] transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-7 w-7" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <DashboardLogo className="w-7 h-7" />
          <span className="font-sora font-bold text-white text-base">
            <span>Finanças</span>
            <span className="text-primary">Zap</span>
          </span>
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
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside 
            className="relative ml-auto flex h-full w-72 flex-col bg-sidebar shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <DashboardLogo className="w-8 h-8" />
                <span className="font-sora font-bold text-white text-base">
                  <span>Finanças</span>
                  <span className="text-primary">Zap</span>
                </span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-sidebar-foreground/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {[...navItems, { path: '/configuracoes', label: 'Configurações', icon: Settings }].filter(item => !item.adminOnly || isAdmin).map(({ path, label, icon: Icon }) => (
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
                  <p className="text-xs font-bold text-white truncate">
                    {user?.full_name || 'Usuário'}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    {user?.email || ''}
                  </p>
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

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-sm -translate-x-1/2 items-end justify-between rounded-full border border-border bg-card px-4 py-2 shadow-lg md:hidden">
        {mobileNavItems.slice(0, 2).map(({ path, label, icon: Icon }) => (
          <Link 
            key={path} 
            to={path} 
            className={cn(
              'flex flex-col items-center gap-1 text-[9px] font-semibold', 
              location.pathname === path ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        ))}
        
        {/* Floating Action Button - Transações */}
        <Link to="/transacoes" className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-sidebar text-white shadow-lg">
          <Plus className="h-5 w-5" />
        </Link>
        
        {mobileNavItems.slice(2).map(({ path, label, icon: Icon }) => (
          <Link 
            key={path} 
            to={path} 
            className={cn(
              'flex flex-col items-center gap-1 text-[9px] font-semibold', 
              location.pathname === path ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 pt-14 md:ml-24 md:pt-0 md:pb-0 pb-20">
        <Outlet />
      </main>

    </div>
  );
}