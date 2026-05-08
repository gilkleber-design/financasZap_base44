import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowDownCircle, ArrowUpCircle, MessageSquare, TrendingUp, Settings, Wallet, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lancamentos', label: 'Lançamentos', icon: Wallet },
  { path: '/contas-pagar', label: 'A Pagar', icon: ArrowDownCircle },
  { path: '/contas-receber', label: 'A Receber', icon: ArrowUpCircle },
  { path: '/relatorios', label: 'Relatórios', icon: TrendingUp },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-50">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-sora font-bold text-white text-lg leading-none">FinançasZap</h1>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5">Controle Financeiro</p>
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
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 flex">
        {navItems.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-1 text-xs transition-colors',
              location.pathname === path ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label.split(' ')[0]}</span>
          </Link>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 sm:ml-64 pb-16 sm:pb-0">
        <Outlet />
      </main>
    </div>
  );
}