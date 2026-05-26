import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AuditReportAccordion from '@/components/reports/AuditReportAccordion';
import PayableDetailDrawer from '@/components/reports/PayableDetailDrawer';
import ConsolidatedReportModal from '@/components/reports/ConsolidatedReportModal';
import AuditCategoryPieChart from '@/components/reports/AuditCategoryPieChart';
import OverviewConsolidatedCTA from '@/components/reports/OverviewConsolidatedCTA';
import OverviewPlannedVsActual from '@/components/reports/OverviewPlannedVsActual';
import OverviewFiscalSummary from '@/components/reports/OverviewFiscalSummary';
import { normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', salario_clt: 'Salário CLT',
  receita_pj: 'Receita PJ', outros: 'Outros',
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Reports() {
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [consolidatedModalOpen, setConsolidatedModalOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 1000),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 100),
  });

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income-sources'],
    queryFn: () => base44.entities.IncomeSource.list('name', 100),
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables-reports'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 1000),
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list('-year', 500),
  });

  const handlePayableClick = (payable) => {
    setSelectedPayable(payable);
    setDrawerOpen(true);
  };

  // ---- LÓGICA DE AUDITORIA (JUNÇÃO DE DADOS) ----
  const selectedMonthStr = format(currentMonth, 'yyyy-MM');
  
  // 1. Pega as contas planejadas (Payables) do mês
  const filteredPayables = payables.filter(p => {
    // Para auditoria financeira, o ideal é sempre olhar a competência. Se não tiver, cai pro vencimento.
    const payableMonth = format(new Date(p.competencia || p.due_date), 'yyyy-MM');
    return payableMonth === selectedMonthStr;
  });

  // 2. Pega os gastos instantâneos (WhatsApp/Transactions órfãs) do mês
  const orphanTransactions = transactions.filter(t => 
    t.type === 'expense' && 
    !t.payable_id && 
    format(new Date(t.date), 'yyyy-MM') === selectedMonthStr
  );

  // 3. Converte a transação órfã no formato que o componente de Auditoria entende
  const mappedOrphans = orphanTransactions.map(t => ({
    id: t.id,
    description: `${t.description} (Avulsa)`,
    amount: t.amount,
    due_date: t.date,
    competencia: t.date,
    category: t.category,
    status: 'paid', // Gastos instantâneos já estão pagos por natureza
    transaction_id: t.id,
    is_orphan: true 
  }));

  // 4. Une tudo na lista final da auditoria
  const auditData = [...filteredPayables, ...mappedOrphans];
  // -----------------------------------------------

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const monthTx = transactions.filter(t => t.date >= start && t.date <= end && new Date(t.date).getFullYear() === currentYear);
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.net_amount || t.amount), 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      name: format(d, 'MMM', { locale: ptBR }),
      Receitas: income,
      Despesas: expense,
      Saldo: income - expense,
    };
  });

  const monthTx = transactions.filter(t => t.date >= monthStart && t.date <= monthEnd && new Date(t.date).getFullYear() === currentYear);

  const rawCategoryData = Object.entries(
    monthTx
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const cat = t.category || 'outros';
        acc[cat] = (acc[cat] || 0) + t.amount;
        return acc;
      }, {})
  ).map(([slug, value]) => ({
    slug,
    name: normalizeCategoryLabel(CATEGORY_LABELS[slug] || slug),
    value,
  }));

  const transitionCategory = rawCategoryData.find((item) => {
    const slug = String(item.slug || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    return slug === 'passivos_de_transicao' || name === 'passivos de transição' || name === 'passivos de transicao';
  });

  const categoryData = rawCategoryData
    .filter((item) => {
      const slug = String(item.slug || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      return slug !== 'passivos_de_transicao' && name !== 'passivos de transição' && name !== 'passivos de transicao';
    })
    .sort((a, b) => b.value - a.value);

  const plannedVsActual = useMemo(() => {
    const categoryIdToSlug = new Map(categories.map((category) => [category.id, category.slug]));
    const budgetBySlug = budgets.reduce((acc, budget) => {
      const slug = categoryIdToSlug.get(budget.category_id);
      if (!slug) return acc;
      if (budget.month === currentMonth.getMonth() + 1 && budget.year === currentMonth.getFullYear()) {
        acc[slug] = Number(budget.amount || 0);
      }
      return acc;
    }, {});

    const excluded = new Set(['passivos_de_transicao', 'retiradas']);
    const actualBySlug = monthTx
      .filter((tx) => tx.type === 'expense')
      .reduce((acc, tx) => {
        const slug = String(tx.category || 'outros').toLowerCase();
        if (excluded.has(slug)) return acc;
        acc[slug] = (acc[slug] || 0) + Number(tx.amount || 0);
        return acc;
      }, {});

    const items = Object.entries(actualBySlug).map(([slug, actual]) => {
      const limit = Number(budgetBySlug[slug] || 0);
      const hasLimit = limit > 0;
      const percent = hasLimit ? (actual / limit) * 100 : 0;
      return {
        slug,
        name: normalizeCategoryLabel(CATEGORY_LABELS[slug] || slug),
        actual,
        limit,
        hasLimit,
        percent,
      };
    });

    return items.sort((a, b) => {
      if (a.hasLimit && b.hasLimit) return b.percent - a.percent;
      if (a.hasLimit) return -1;
      if (b.hasLimit) return 1;
      return b.actual - a.actual;
    });
  }, [budgets, categories, currentMonth, monthTx]);

  const receivedReceivables = receivables.filter((item) => item.status === 'received' && item.due_date >= monthStart && item.due_date <= monthEnd);
  const fiscalBySource = receivedReceivables.reduce((acc, item) => {
    const key = item.income_source_id || 'outras';
    if (!acc[key]) acc[key] = { gross: 0, tax: 0 };
    const gross = Number(item.amount || 0);
    const tax = gross * (Number(item.tax_rate || 0) / 100);
    acc[key].gross += gross;
    acc[key].tax += tax;
    return acc;
  }, {});

  const totalGross = receivedReceivables.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalTax = Object.values(fiscalBySource).reduce((sum, item) => sum + item.tax, 0);
  const totalNet = totalGross - totalTax;
  const effectiveRate = totalGross > 0 ? `${((totalTax / totalGross) * 100).toFixed(1)}%` : '0.0%';
  const sourceRows = Object.entries(fiscalBySource)
    .map(([sourceId, data]) => ({
      name: sourceId === 'outras' ? 'Outras' : (incomeSources.find((source) => source.id === sourceId)?.name || 'PJ não identificada'),
      tax: data.tax,
    }))
    .sort((a, b) => b.tax - a.tax);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold">Relatórios</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão financeira completa</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <OverviewConsolidatedCTA currentMonth={currentMonth} onOpen={() => setConsolidatedModalOpen(true)} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border border-[#E8EDF2] shadow-sm">
              <CardHeader><CardTitle className="text-base">Fluxo de Caixa — Últimos 6 Meses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={months}>
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-3 text-[9px] italic text-[#7B92A8]">* despesas registradas a partir de mai/26</p>
              </CardContent>
            </Card>

            <Card className="border border-[#E8EDF2] shadow-sm">
              <CardHeader><CardTitle className="text-base">Despesas por Categoria (Mês Atual)</CardTitle></CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma despesa neste mês</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                        {categoryData.map((item, i) => <Cell key={item.slug || i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => fmt(v)} />
                      <Legend formatter={(_, __, index) => categoryData[index]?.name || ''} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {transitionCategory?.value > 0 && (
                  <div className="mt-3 rounded-r-md border-l-[3px] border-l-[#F0A030] bg-[#FFF8EC] px-3 py-2 text-[11px] text-[#C0622A]">
                    ⚠ Passivos de Transição ({fmt(transitionCategory.value)}) excluídos desta visão — categoria temporária de migração
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <OverviewPlannedVsActual items={plannedVsActual} currentMonth={currentMonth} />

          <OverviewFiscalSummary
            totalGross={totalGross}
            totalTax={totalTax}
            totalNet={totalNet}
            effectiveRate={effectiveRate}
            sourceRows={sourceRows}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <AuditCategoryPieChart auditData={auditData} categories={categories} />

          <AuditReportAccordion 
             payables={auditData} 
             onRowClick={handlePayableClick} 
             categories={categories}
           />
        </TabsContent>
      </Tabs>

      <PayableDetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} payable={selectedPayable} />
      <ConsolidatedReportModal open={consolidatedModalOpen} onOpenChange={setConsolidatedModalOpen} currentMonth={currentMonth} />
    </div>
  );
}