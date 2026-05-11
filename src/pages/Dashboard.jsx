import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SummaryCard from '@/components/dashboard/SummaryCard';
import CategoryChart from '@/components/dashboard/CategoryChart';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import PendingAlerts from '@/components/dashboard/PendingAlerts';
import ReceivablesView from '@/components/dashboard/ReceivablesView';
import PayablesView from '@/components/dashboard/PayablesView';

// computed dynamically inside component

export default function Dashboard() {
  const [activeView, setActiveView] = useState('despesas'); // 'despesas' | 'receitas'
  const queryClient = useQueryClient();

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 200),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 50),
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 500),
  });

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  // Receitas: apenas transações recebidas no mês corrente (ano corrente)
  const currentYear = new Date().getFullYear();
  const monthTx = transactions.filter(t => t.date >= monthStart && t.date <= monthEnd && new Date(t.date).getFullYear() === currentYear);
  const totalIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.net_amount || t.amount), 0);
  const totalIncomeGross = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  // Despesas: com vencimento no mês corrente (ano corrente)
  const monthExpenseTx = transactions.filter(t => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd && new Date(t.date).getFullYear() === currentYear);
  const totalExpense = monthExpenseTx.reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // A pagar: vencimento <= hoje (ano corrente)
  const pendingPayables = payables.filter(p => p.status === 'pending' && p.due_date <= todayStr && new Date(p.due_date).getFullYear() === currentYear);
  const pendingReceivables = receivables.filter(r => r.status === 'pending' && new Date(r.due_date).getFullYear() === currentYear);

  const expenseByCategory = monthTx
    .filter(t => t.type === 'expense' && t.category !== 'transferencia_liquidacao')
    .reduce((acc, t) => {
      const cat = t.category || 'outros';
      acc[cat] = (acc[cat] || 0) + t.amount;
      return acc;
    }, {});

  const categoryData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-sora font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">{format(now, "MMMM 'de' yyyy", { locale: ptBR })}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <SummaryCard
          title="Receitas do Mês"
          value={totalIncome}
          grossValue={totalIncomeGross}
          icon={TrendingUp}
          color="success"
        />
        <SummaryCard
          title="Despesas do Mês"
          value={totalExpense}
          icon={TrendingDown}
          color="destructive"
        />
        <SummaryCard
          title="Saldo Líquido"
          value={balance}
          icon={Wallet}
          color={balance >= 0 ? 'success' : 'destructive'}
        />
        <SummaryCard
          title="A Pagar (Pendente)"
          value={pendingPayables.reduce((s, p) => s + p.amount, 0)}
          icon={AlertCircle}
          color="warning"
        />
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 border-b border-border pb-2 md:pb-3">
        <Button
          variant={activeView === 'despesas' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveView('despesas')}
          className="text-xs"
        >
          📊 Despesas
        </Button>
        <Button
          variant={activeView === 'receitas' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveView('receitas')}
          className="text-xs"
        >
          💰 Receitas
        </Button>
      </div>

      {activeView === 'despesas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CategoryChart data={categoryData} />
            <RecentTransactions transactions={transactions.filter(t => t.type === 'expense').slice(0, 8)} />
          </div>
          <div>
            <PendingAlerts
              payables={pendingPayables}
              receivables={pendingReceivables}
              mode="despesas"
              onRefresh={() => queryClient.invalidateQueries()}
            />
          </div>
        </div>
      )}

      {activeView === 'receitas' && (
        <ReceivablesView receivables={receivables} incomeSources={incomeSources} transactions={transactions} />
      )}
    </div>
  );
}