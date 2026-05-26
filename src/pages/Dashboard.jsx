import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import DashboardLogo from '@/components/dashboard/DashboardLogo';
import MonthBalanceCard from '@/components/dashboard/MonthBalanceCard';
import AttentionCard from '@/components/dashboard/AttentionCard';
import ReceivablesPipelineCard from '@/components/dashboard/ReceivablesPipelineCard';
import { formatCurrency, getInitials, normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const formatMonthKey = (date) => format(date, 'yyyy-MM');
const formatDateKey = (date) => format(date, 'yyyy-MM-dd');

export default function DashboardPage() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const currentMonthKey = formatMonthKey(now);
  const previousMonthDate = subMonths(now, 1);
  const previousMonthKey = formatMonthKey(previousMonthDate);
  const pipelineMonths = Array.from({ length: 4 }, (_, index) => subMonths(now, 3 - index));

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: transactions = [] } = useQuery({ queryKey: ['dashboard-transactions'], queryFn: () => base44.entities.Transaction.list('-date', 2000) });
  const { data: payables = [] } = useQuery({ queryKey: ['dashboard-payables'], queryFn: () => base44.entities.Payable.list('-due_date', 1000) });
  const { data: receivables = [] } = useQuery({ queryKey: ['dashboard-receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 1000) });
  const { data: budgets = [] } = useQuery({ queryKey: ['dashboard-budgets'], queryFn: () => base44.entities.Budget.list('-year', 500) });
  const { data: categories = [] } = useQuery({ queryKey: ['dashboard-categories'], queryFn: () => base44.entities.Category.list('name', 500) });
  const { data: hospitals = [] } = useQuery({ queryKey: ['dashboard-hospitals'], queryFn: () => base44.entities.Hospital.list('name', 500) });
  const { data: shifts = [] } = useQuery({ queryKey: ['dashboard-shifts'], queryFn: () => base44.entities.Shift.list('-date', 4000) });

  const dashboardData = useMemo(() => {
    const paidTransactionStatuses = new Set(['registered', 'conciliated']);
    const validTransactions = transactions.filter((item) => !item.status || paidTransactionStatuses.has(item.status));

    const currentMonthTransactions = validTransactions.filter((item) => item.date >= formatDateKey(monthStart) && item.date <= formatDateKey(monthEnd));
    const previousMonthRangeStart = formatDateKey(startOfMonth(previousMonthDate));
    const previousMonthRangeEnd = formatDateKey(endOfMonth(previousMonthDate));
    const previousMonthTransactions = validTransactions.filter((item) => item.date >= previousMonthRangeStart && item.date <= previousMonthRangeEnd);

    const receivedIncome = currentMonthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
    const paidExpense = currentMonthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const previousBalance = previousMonthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0)
      - previousMonthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const currentMonthReceivables = receivables.filter((item) => (item.competencia || item.due_date || '').startsWith(currentMonthKey));
    const toReceive = currentMonthReceivables.filter((item) => item.status !== 'received').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
    const balance = receivedIncome - paidExpense;
    const variation = previousBalance === 0 ? (balance === 0 ? 0 : 100) : ((balance - previousBalance) / Math.abs(previousBalance)) * 100;

    const overdueReceivables = receivables
      .filter((item) => item.status !== 'received' && item.due_date && item.due_date < formatDateKey(now))
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((item) => ({
        ...item,
        amount: Number(item.net_amount || item.amount || 0),
        hospital_name: hospitals.find((hospital) => hospital.income_source_id === item.income_source_id)?.name || item.description,
        competencia_label: item.competencia ? format(new Date(`${item.competencia}T12:00:00`), "MMM/yy", { locale: ptBR }) : 'Sem competência',
      }));

    const urgentPayables = payables
      .filter((item) => item.status !== 'paid' && item.due_date && item.due_date <= formatDateKey(now))
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((item) => ({
        ...item,
        amount: Number(item.amount || 0),
        category_slug: item.category || categories.find((category) => category.id === item.category_id)?.slug,
      }));

    const monthNumber = now.getMonth() + 1;
    const yearNumber = now.getFullYear();
    const expenseCategories = categories.filter((item) => item.type === 'expense');
    const budgetOverruns = expenseCategories.map((category) => {
      const budget = budgets.find((item) => Number(item.month) === monthNumber && Number(item.year) === yearNumber && item.category_id === category.id);
      const spent = validTransactions
        .filter((item) => item.type === 'expense' && item.date >= formatDateKey(monthStart) && item.date <= formatDateKey(monthEnd) && (item.category === category.slug || item.category === category.id))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const limit = Number(budget?.amount || 0);
      return { slug: category.slug, name: category.name || normalizeCategoryLabel(category.slug), budget: limit, spent, overrun: spent - limit };
    }).filter((item) => item.budget > 0 && item.spent > item.budget).sort((a, b) => b.overrun - a.overrun);

    const pipelineMonthHeaders = pipelineMonths.map((date) => ({ key: formatMonthKey(date), label: format(date, 'MMM', { locale: ptBR }).toUpperCase() }));

    const pipelineRows = hospitals.filter((hospital) => hospital.active !== false).map((hospital) => {
      const cells = pipelineMonths.map((date) => {
        const key = formatMonthKey(date);
        const monthShifts = shifts.filter((shift) => shift.hospital_id === hospital.id && (shift.status === 'done' || shift.status === 'scheduled') && shift.date?.startsWith(key));
        const receivableMatches = receivables.filter((item) => item.income_source_id === hospital.income_source_id && (item.competencia || '').startsWith(`${key}-`));
        const amount = receivableMatches.reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0) || monthShifts.reduce((sum, shift) => sum + Number(shift.valor || 0), 0);
        const receivedAmount = receivableMatches.filter((item) => item.status === 'received').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
        const hasReceived = receivableMatches.some((item) => item.status === 'received');
        const hasPending = receivableMatches.some((item) => item.status !== 'received');
        const expectedDate = hospital.payment_day ? formatDateKey(new Date(date.getFullYear(), date.getMonth() + Number(hospital.payment_months_offset || 1), Math.min(Number(hospital.payment_day || 1), 28))) : null;
        const isFuture = key > currentMonthKey;
        let status = 'futuro';
        if (hasReceived && !hasPending) status = 'recebido';
        else if (hasReceived && hasPending) status = 'parcial';
        else if (expectedDate && expectedDate < formatDateKey(now) && amount > 0) status = 'vencido';
        else if (amount > 0) status = isFuture ? 'futuro' : 'a_receber';
        return { key: `${hospital.id}-${key}`, status, amount, partialAmount: receivedAmount };
      });

      return { hospitalId: hospital.id, hospitalName: hospital.name, cells };
    });

    const pipelineTotals = pipelineMonthHeaders.map((month) => {
      const columnCells = pipelineRows.map((row) => row.cells.find((cell) => cell.key.endsWith(month.key))).filter(Boolean);
      const amount = columnCells.reduce((sum, cell) => sum + Number(cell.amount || 0), 0);
      return {
        key: month.key,
        amount,
        hasOverdue: columnCells.some((cell) => cell.status === 'vencido'),
        allReceived: columnCells.length > 0 && columnCells.every((cell) => cell.status === 'recebido'),
        allFuture: columnCells.length > 0 && columnCells.every((cell) => cell.status === 'futuro'),
      };
    });

    return {
      balance,
      receivedIncome,
      paidExpense,
      toReceive,
      variation: Number.isFinite(variation) ? variation : 0,
      previousMonthLabel: format(previousMonthDate, 'MMMM', { locale: ptBR }),
      hasActivity: receivedIncome > 0 || paidExpense > 0,
      overdueReceivables,
      overdueReceivablesTotal: overdueReceivables.reduce((sum, item) => sum + item.amount, 0),
      urgentPayables,
      urgentPayablesTotal: urgentPayables.reduce((sum, item) => sum + item.amount, 0),
      budgetOverruns,
      pipelineMonthHeaders,
      pipelineRows,
      pipelineTotals,
      hasHospitals: hospitals.length > 0,
    };
  }, [transactions, payables, receivables, budgets, categories, hospitals, shifts]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <div className="md:hidden bg-sidebar px-4 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DashboardLogo className="h-7 w-7" />
            <div className="text-base font-bold"><span>Finanças</span><span className="text-primary">Zap</span></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative"><Bell className="h-4 w-4" /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" /></div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{getInitials(me?.full_name)}</div>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[11px] text-white/60">Olá, Dr. {me?.full_name?.split(' ')[0] || 'Usuário'}</p>
          <p className="mt-1 text-sm font-semibold capitalize text-white">{format(now, 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <DashboardLogo className="h-5 w-5" />
          <div className="text-lg font-bold"><span className="text-foreground">Finanças</span><span className="text-primary">Zap</span></div>
          <span className="h-5 w-px bg-border" />
          <p className="text-sm text-muted-foreground">Olá, Dr. {me?.full_name?.split(' ')[0] || 'Usuário'} — bom dia</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold capitalize text-foreground">{format(now, 'MMMM yyyy', { locale: ptBR })}</span>
          <div className="relative"><Bell className="h-4 w-4 text-muted-foreground" /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" /></div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-white">{getInitials(me?.full_name)}</div>
        </div>
      </div>

      <div className="space-y-3 p-4 md:p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <MonthBalanceCard data={dashboardData} />
          <AttentionCard data={dashboardData} />
        </div>
        <ReceivablesPipelineCard
          months={dashboardData.pipelineMonthHeaders}
          rows={dashboardData.pipelineRows}
          totals={dashboardData.pipelineTotals}
          hasHospitals={dashboardData.hasHospitals}
        />
      </div>

      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-sm -translate-x-1/2 items-end justify-between rounded-full border border-border bg-card px-4 py-2 shadow-lg md:hidden">
        <BottomItem to="/" label="Início" active />
        <BottomItem to="/relatorios" label="Relatórios" />
        <Link to="/transacoes" className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-sidebar text-white shadow-lg"><Plus className="h-5 w-5" /></Link>
        <BottomItem to="/calendario" label="Calendário" />
        <BottomItem to="/configuracoes" label="Config" />
      </div>
    </div>
  );
}

function BottomItem({ to, label, active = false }) {
  return (
    <Link to={to} className={`flex flex-col items-center gap-1 text-[9px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
      <span>{label}</span>
    </Link>
  );
}