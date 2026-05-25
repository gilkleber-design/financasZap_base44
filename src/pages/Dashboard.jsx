import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Wallet, Coins, Scale, AlertTriangle, MessageCircle, MoreHorizontal, Activity, Info } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isBefore, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- HELPER FUNCTIONS ---
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export const formatCurrency = (val, prefix = 'R$ ') => {
  if (typeof val !== 'number') return `${prefix}0,00`;
  return `${prefix}${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const CurrencyText = ({ value, prefix = 'R$ ' }) => (
  <span>{formatCurrency(value, prefix)}</span>
);

// --- SHARED UI COMPONENTS ---
const ProgressBar = ({ value, Compromisso, max, className, showHashedCompromisso, variant = 'income' }) => {
  const valueWidth = max > 0 ? (value / max) * 100 : (value > 0 ? 100 : 0);
  const CompromissoWidth = max > 0 ? (Compromisso / max) * 100 : (Compromisso > 0 ? 100 : 0);
  const totalPercent = Math.min(valueWidth + CompromissoWidth, 100);

  let mainColor = "bg-emerald-500";
  let compColor = "bg-emerald-200";

  if (variant === 'expense') {
    if (totalPercent < 50) {
      mainColor = "bg-emerald-500";
      compColor = "bg-emerald-200";
    } else if (totalPercent < 75) {
      mainColor = "bg-amber-500";
      compColor = "bg-amber-200";
    } else if (totalPercent < 90) {
      mainColor = "bg-orange-500";
      compColor = "bg-orange-200";
    } else {
      mainColor = "bg-rose-500";
      compColor = "bg-rose-200";
    }
  }

  return (
    <div className={cn("h-3.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative", className)}>
      <div
        className={cn("h-full absolute left-0 top-0 transition-colors duration-500", mainColor)}
        style={{ width: `${Math.min(valueWidth, 100)}%`, zIndex: 1 }}
      />
      <div
        className={cn("h-full absolute top-0 transition-colors duration-500", compColor)}
        style={{ width: `${Math.min(CompromissoWidth, 100 - valueWidth)}%`, left: `${Math.min(valueWidth, 100)}%`, zIndex: 0 }}
      >
        {showHashedCompromisso && (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_4px,_rgba(255,255,255,0.4)_4px,_rgba(255,255,255,0.4)_8px)]" />
        )}
      </div>
    </div>
  );
};

const HealthBar = ({ percentage }) => {
  const segments = [
    { color: 'bg-rose-500' },
    { color: 'bg-orange-500' },
    { color: 'bg-amber-500' },
    { color: 'bg-emerald-500' },
    { color: 'bg-emerald-600' },
  ];
  return (
    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden relative border border-slate-200 dark:border-slate-700">
      {segments.map((s, i) => (
        <div key={i} className={cn("h-full flex-grow", s.color)} style={{ width: `calc(100% / ${segments.length})`}} />
      ))}
      <div
        className="absolute w-3 h-3 bg-white rounded-full border-2 border-slate-700 shadow top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500"
        style={{ left: `${Math.max(0, Math.min(percentage, 100))}%` }}
      />
    </div>
  );
};

const Card = ({ children, className }) => (
  <div className={cn("bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm", className)}>{children}</div>
);
const CardHeader = ({ children, className }) => (
  <div className={cn("p-5 border-b border-slate-100 dark:border-slate-800", className)}>{children}</div>
);
const CardTitle = ({ children, className }) => (
  <h3 className={cn("text-lg font-semibold text-slate-950 dark:text-white", className)}>{children}</h3>
);
const CardContent = ({ children, className }) => (
  <div className={cn("p-5", className)}>{children}</div>
);

// Alterado de <div> para <button> para corrigir erros de ESLint (jsx-a11y)
const KpiTitle = ({ title, description }) => (
  <button type="button" className="flex items-center gap-1.5 relative group w-fit cursor-help outline-none">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">{title}</p>
    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0" />
    
    <div className="absolute z-50 bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium leading-relaxed rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all shadow-xl pointer-events-none normal-case tracking-normal whitespace-normal text-left">
      {description}
      <div className="absolute top-full left-4 border-[6px] border-transparent border-t-slate-900 dark:border-t-slate-100" />
    </div>
  </button>
);

// --- MAIN DASHBOARD PAGE ---
export default function DashboardPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');
  const nextWeekStr = format(addDays(now, 7), 'yyyy-MM-dd');

  // --- QUERIES ---
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('', 500)
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', month, year],
    queryFn: () => base44.entities.Budget.filter({ month, year }, '', 500)
  });

  const { data: rawTransactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 1000),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('due_date', 500),
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('due_date', 500),
  });

  // --- LÓGICA DE NEGÓCIO BLINDADA ---
  const stats = useMemo(() => {
    const catFaturaCartao = categories.find(c => 
      c?.name?.toLowerCase()?.includes('faturas de cartão') || 
      c?.name?.toLowerCase()?.includes('fatura de cartão')
    );
    
    const validTransactions = rawTransactions.filter(t => !t.status || t.status === 'registered' || t.status === 'conciliated');
    const monthTransactions = validTransactions.filter(t => t.date >= monthStart && t.date <= monthEnd);
    
    const realIncomeTotal = monthTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
    const realExpenseTotal = monthTransactions
      .filter(t => t.type === 'expense' && !t.card_id)
      .reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
      
    const realBalance = realIncomeTotal - realExpenseTotal;

    const monthIncome = realIncomeTotal;
    
    const pendingCurrentMonth = receivables.filter(r => r.status === 'pending' && r.due_date >= monthStart && r.due_date <= monthEnd);
    const pendingCurrentTotal = pendingCurrentMonth.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);
    
    const pendingPreviousMonths = receivables.filter(r => r.status === 'pending' && r.due_date < monthStart);
    const pendingOverdueTotal = pendingPreviousMonths.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

    const targetIncome = monthIncome + pendingCurrentTotal + pendingOverdueTotal || (monthIncome + 1);
    const incomePercentage = Math.min((monthIncome / targetIncome) * 100, 100);

    const overdueIncomes = receivables.filter(r => r.status === 'pending' && isBefore(new Date(r.due_date), new Date(todayStr)));
    const overdueIncomeTotal = overdueIncomes.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

    const pendingPayablesMonth = payables.filter(p => p.status === 'pending' && p.due_date >= monthStart && p.due_date <= monthEnd);
    const upcomingExpensesList = payables.filter(p => p.status === 'pending' && p.due_date <= nextWeekStr).slice(0, 5);

    const mapCategoryStats = (type) => categories
      .filter(c => c.type === type && (type === 'income' || !catFaturaCartao || c.id !== catFaturaCartao.id))
      .map(cat => {
        const meta = budgets.find(b => b.category_id === cat.id)?.amount || 0;
        const realizado = monthTransactions.filter(t => t.category === cat.id || t.category === cat.slug).reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
        const pendentes = type === 'expense' ? pendingPayablesMonth : pendingCurrentMonth;
        const comprometido = pendentes.filter(p => p.category_id === cat.id || p.category === cat.slug).reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
        return { ...cat, meta, realizado, comprometido, totalUsage: realizado + comprometido, icon: Activity };
      })
      .filter(c => c.meta > 0 || c.totalUsage > 0)
      .sort((a, b) => b.meta - a.meta);

    const expenseStats = mapCategoryStats('expense');
    const incomeStats = mapCategoryStats('income');

    const totalExpenseBudget = expenseStats.reduce((acc, c) => acc + c.meta, 0);
    const totalExpenseProjected = expenseStats.reduce((acc, c) => acc + c.totalUsage, 0);
    const budgetBalance = totalExpenseBudget - totalExpenseProjected;
    const healthPercent = totalExpenseBudget > 0 ? Math.max(0, Math.min((budgetBalance / totalExpenseBudget) * 100, 100)) : 0;

    return {
      realBalance,
      monthIncome,
      targetIncome,
      baseTarget: monthIncome + pendingCurrentTotal,
      overdueTarget: pendingOverdueTotal,
      incomePercentage,
      projectedBalance: budgetBalance,
      healthPercent,
      overdueIncomes,
      overdueIncomeTotal,
      upcomingExpensesList,
      expenseStats,
      incomeStats
    };
  }, [rawTransactions, budgets, categories, payables, receivables, monthStart, monthEnd, todayStr, nextWeekStr]);

  const kpiCards = [
    {
      title: 'Resultado Mensal',
      description: 'Fluxo de caixa real sob regime de caixa. É a matemática seca: dinheiro que de fato pingou na conta menos as saídas consolidadas do mês atual.',
      value: stats.realBalance,
      subtitle: '(Receitas vs Saídas Reais de Conta)',
      icon: Wallet,
      color: 'emerald',
      customBg: true,
    },
    {
      title: 'Expectativa de Caixa',
      description: 'Seu norte de faturamento. Receita que já entrou comparada ao total que você espera realizar no mês inteiro (recebido + a receber + atrasados).',
      value: stats.monthIncome,
      target: stats.targetIncome,
      baseTarget: stats.baseTarget,
      overdueTarget: stats.overdueTarget,
      percentage: stats.incomePercentage,
      icon: Coins,
      color: 'emerald',
      isMetaCard: true,
    },
    {
      title: 'Saúde do Orçamento',
      description: 'Controle do teto de gastos. Compara o limite planejado de despesas no mês com o total projetado (o que já foi pago + boletos pendentes).',
      value: stats.projectedBalance,
      healthPercent: stats.healthPercent,
      icon: Scale,
      color: 'amber',
    },
    {
      title: 'A Cobrar / Vencidas',
      description: 'Dinheiro na mesa que virou pendência. A soma total de todas as receitas que já passaram do prazo original de vencimento e não foram pagas.',
      value: stats.overdueIncomeTotal,
      count: stats.overdueIncomes.length,
      icon: AlertTriangle,
      color: 'rose',
      urgent: true,
    },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold uppercase tracking-tight text-slate-950 dark:text-white">PAINEL DE CONTROLE</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold mt-1">
            {format(now, "MMMM yyyy", { locale: ptBR })}
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-opacity">
          <span className="text-xl leading-none text-transparent bg-gradient-to-br from-green-400 via-blue-500 to-red-500 bg-clip-text">+</span>
          Novo Lançamento Rápido
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {kpiCards.map((card, index) => {
          const Icon = card.icon;
          const valueText = <CurrencyText value={card.value} />;

          if (card.customBg && card.color === 'emerald') {
            return (
              <div key={index} className="rounded-3xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex gap-4 items-start shadow-sm min-w-0">
                <div className="p-3 bg-white dark:bg-emerald-900 rounded-2xl border border-emerald-100 shrink-0">
                  <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 space-y-1 min-w-0 relative">
                  <KpiTitle title={card.title} description={card.description} />
                  <p className="text-xl lg:text-2xl font-bold text-slate-950 dark:text-white truncate">{valueText}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{card.subtitle}</p>
                </div>
              </div>
            );
          }

          if (card.urgent) {
            return (
              <div key={index} className="rounded-3xl border-2 border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-5 flex gap-4 items-start shadow-sm relative min-w-0">
                <Icon className="w-5 h-5 text-rose-500 absolute top-4 right-4" />
                <div className="p-3 bg-white dark:bg-rose-900 rounded-2xl border border-rose-100 shrink-0">
                  <Icon className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="flex-1 space-y-1 min-w-0 relative">
                  <KpiTitle title={card.title} description={card.description} />
                  <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                    <p className="text-xl lg:text-2xl font-bold text-slate-950 dark:text-white truncate">{card.count}</p>
                    <span className="text-sm font-medium text-slate-950 dark:text-white truncate">receitas vencidas</span>
                  </div>
                  <p className="text-lg font-semibold text-slate-950 dark:text-white truncate">{valueText}</p>
                  <p className="text-[11px] text-muted-foreground truncate">urgentes para os próximos 7 dias</p>
                </div>
              </div>
            );
          }

          return (
            <div key={index} className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 items-start shadow-sm relative min-w-0">
              <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-5 h-5" /></button>
              <div className="flex gap-4 items-start w-full min-w-0">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 shrink-0">
                  <Icon className={`w-6 h-6 ${card.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                </div>
                <div className="flex-1 space-y-1 min-w-0 relative">
                  <KpiTitle title={card.title} description={card.description} />
                  
                  {card.title.includes('Saúde') ? (
                    <div className="flex flex-col items-start w-full min-w-0">
                      <p className={cn("text-xl lg:text-2xl font-bold truncate w-full", card.value >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {card.value >= 0 ? 'Sobra: ' : 'Estouro: '}<CurrencyText value={Math.abs(card.value)} />
                      </p>
                      <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate w-full">Saldo do limite planejado</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start w-full min-w-0">
                      <div className="flex flex-col xl:flex-row xl:items-baseline gap-1 xl:gap-1.5 w-full min-w-0">
                        <p className="text-xl lg:text-2xl font-bold text-slate-950 dark:text-white truncate max-w-full">{valueText}</p>
                        {card.target !== undefined && (
                          <span className="text-sm text-slate-400 truncate max-w-full">/ <CurrencyText value={card.target} /></span>
                        )}
                      </div>
                      
                      {card.isMetaCard && card.overdueTarget > 0 && (
                        <div className="text-[10px] font-semibold text-slate-400 mt-1 truncate w-full">
                          (<span className="text-sky-500"><CurrencyText value={card.baseTarget} /> base</span> + <span className="text-rose-400"><CurrencyText value={card.overdueTarget} /> atrasos</span>)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {card.healthPercent !== undefined ? (
                <div className="w-full space-y-1">
                  <HealthBar percentage={card.healthPercent} />
                  <p className="text-[11px] text-right text-muted-foreground">índice limite de gastos</p>
                </div>
              ) : (
                <div className="w-full space-y-1">
                  <ProgressBar value={card.value} Compromisso={0} max={card.target} showHashedCompromisso={(card.percentage || 0) < 100} variant="income" />
                  <p className="text-[11px] text-right text-muted-foreground">{(card.percentage || 0).toFixed(0)}% recebido</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Content (70/30 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-[70%_30%] gap-6 lg:gap-8 items-start">
        <div className="space-y-6">
          <Card className="p-0 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
              <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">Raio-X de Despesas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <XRayTable categories={stats.expenseStats} type="despesa" />
            </CardContent>
          </Card>

          <Card className="p-0 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
              <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">Raio-X de Receitas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <XRayTable categories={stats.incomeStats} type="receita" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="p-5 py-4 border-b border-rose-100 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-rose-600 dark:text-rose-400">Receitas Vencidas / Cobranças Pendentes</CardTitle>
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
              <SidebarTable data={stats.overdueIncomes} type="vencidas" urgent={true} />
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="p-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">Próximos Vencimentos de Despesas</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
              <SidebarTable data={stats.upcomingExpensesList} type="proximos" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---
const XRayTable = ({ categories, type }) => {
  const isExpense = type === 'despesa';
  const headerTarget = isExpense ? 'Teto (Planned)' : 'Meta (Planned)';
  const headerExec = isExpense ? 'Total Usado (Comprometido + Realizado)' : 'Total Recebido';

  if (!categories || categories.length === 0) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Nenhum dado registrado para este mês.</div>;
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1fr,20%,30%] md:grid-cols-[1fr,15%,25%] gap-4 p-5 py-3 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
        <span className="text-left">Categoria</span>
        <span>{headerTarget}</span>
        <span>{headerExec}</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {categories.map((cat, i) => {
          const Icon = cat.icon || Activity;
          return (
            <div key={i} className="grid grid-cols-[1fr,20%,30%] md:grid-cols-[1fr,15%,25%] gap-x-4 p-5 py-4 items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0" style={{ borderColor: cat.color }}>
                  <Icon className="w-5 h-5 text-slate-600 dark:text-slate-400" style={{ color: cat.color }} />
                </div>
                <div className="flex-grow space-y-1 min-w-0 overflow-hidden">
                  <p className="font-semibold text-sm text-slate-950 dark:text-white truncate">{cat.name}</p>
                  <ProgressBar value={cat.realizado} Compromisso={cat.comprometido} max={cat.meta} showHashedCompromisso={isExpense || cat.comprometido > 0} variant={isExpense ? 'expense' : 'income'} />
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white text-right truncate"><CurrencyText value={cat.meta} /></div>
              <div className="text-sm font-bold text-slate-950 dark:text-white text-right truncate"><CurrencyText value={cat.totalUsage} /></div>
            </div>
          );
        })}
      </div>
      <div className="p-4 px-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-4 text-slate-600 dark:text-slate-400 font-medium">
        <div className="flex items-center gap-1.5 text-sm font-semibold"><div className="w-5 h-2 rounded bg-slate-400 dark:bg-slate-500" /> Realizado</div>
        <div className="flex items-center gap-1.5 text-sm font-semibold relative overflow-hidden">
          <div className="w-5 h-2 rounded bg-slate-200 dark:bg-slate-700" /><div className="absolute left-0 top-0 w-5 h-2 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_2px,_rgba(255,255,255,0.4)_2px,_rgba(255,255,255,0.4)_4px)]" /> Comprometido
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold"><div className="w-5 h-2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" /> Planejado</div>
      </div>
    </div>
  );
};

const SidebarTable = ({ data, type, urgent }) => {
  const isOverdueIncome = type === 'vencidas';

  if (!data || data.length === 0) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Nenhum registro pendente.</div>;
  }

  return (
    <div className="w-full">
       <div className={cn("grid grid-cols-[80px,1fr,auto] gap-x-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", urgent ? "border-l-4 border-rose-500" : "")}>
        <span>Data</span>
        <span>Descrição</span>
        <span>{isOverdueIncome ? '' : 'Montante'}</span>
      </div>
      {data.map((item, i) => {
        const dateObj = item.due_date ? new Date(item.due_date) : new Date();
        const formattedDate = format(dateObj, "dd/MM/yyyy");

        return (
          <div key={i} className={cn("grid grid-cols-[80px,1fr,auto] gap-x-3 px-5 py-3.5 items-center", urgent ? "border-l-4 border-rose-500 bg-rose-50/20 dark:bg-rose-950/10" : "")}>
            <span className={cn("text-sm shrink-0", urgent ? "font-semibold text-slate-950 dark:text-white" : "text-slate-500 dark:text-slate-400")}>{formattedDate}</span>
            <div className={cn("flex items-center gap-1.5 text-sm min-w-0", urgent ? "font-semibold text-rose-600 dark:text-rose-400" : "font-medium text-slate-950 dark:text-white")}>
               {urgent && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
               <span className="truncate">{item.description}</span>
            </div>
            {isOverdueIncome ? (
               <button className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-full text-xs font-semibold shadow hover:opacity-90 shrink-0">
                 <MessageCircle className="w-4 h-4 text-emerald-500" /> Cobrar
               </button>
            ) : (
                <div className="flex items-center gap-2 text-right shrink-0">
                    <span className="text-sm font-bold text-slate-950 dark:text-white truncate max-w-[100px]"><CurrencyText value={parseFloat(item.amount)} /></span>
                    <button className="flex items-center px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold shadow hover:bg-slate-50 transition shrink-0">
                         Dar Baixa
                    </button>
                </div>
            )}
          </div>
        );
      })}
    </div>
  );
};