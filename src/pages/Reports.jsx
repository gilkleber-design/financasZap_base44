import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AuditReportAccordion from '@/components/reports/AuditReportAccordion';
import PayableDetailDrawer from '@/components/reports/PayableDetailDrawer';
import ConsolidatedReportModal from '@/components/reports/ConsolidatedReportModal';
import AuditCategoryPieChart from '@/components/reports/AuditCategoryPieChart';
import OverviewPlannedVsActual from '@/components/reports/OverviewPlannedVsActual';
import OverviewFiscalSummary from '@/components/reports/OverviewFiscalSummary';

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

  const categoryBySlug = useMemo(
    () => categories.reduce((acc, category) => {
      const slug = String(category.slug || '').toLowerCase();
      if (slug) acc[slug] = category;
      return acc;
    }, {}),
    [categories]
  );

  const getCategoryNameBySlug = useCallback((slug) => {
    const normalizedSlug = String(slug || '').toLowerCase();
    return categoryBySlug[normalizedSlug]?.name || 'Outros';
  }, [categoryBySlug]);

  // ---- LÓGICA DE AUDITORIA ----
  const selectedMonthStr = format(currentMonth, 'yyyy-MM');
  
  const filteredPayables = payables.filter(p => {
    const payableMonth = format(new Date(p.competencia || p.due_date), 'yyyy-MM');
    return payableMonth === selectedMonthStr;
  });

  const orphanTransactions = transactions.filter(t => 
    t.type === 'expense' && 
    !t.payable_id && 
    format(new Date(t.date), 'yyyy-MM') === selectedMonthStr
  );

  const mappedOrphans = orphanTransactions.map(t => ({
    id: t.id,
    description: `${t.description} (Avulsa)`,
    amount: t.amount,
    due_date: t.date,
    competencia: t.date,
    category: t.category,
    status: 'paid', 
    transaction_id: t.id,
    is_orphan: true 
  }));

  const auditData = [...filteredPayables, ...mappedOrphans];
  // -----------------------------------------------

  // Fluxo de Caixa (Últimos 6 meses)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const monthFiltered = transactions.filter(t => t.date >= start && t.date <= end && new Date(t.date).getFullYear() === currentYear);
    const income = monthFiltered.filter(t => t.type === 'income').reduce((s, t) => s + (t.net_amount || t.amount), 0);
    const expense = monthFiltered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      name: format(d, 'MMM', { locale: ptBR }),
      Receitas: income,
      Despesas: expense,
      Saldo: income - expense,
    };
  });

  // Estabilizando monthTx para o Linter não reclamar
  const monthTx = useMemo(() => {
    return transactions.filter(t => t.date >= monthStart && t.date <= monthEnd && new Date(t.date).getFullYear() === currentYear);
  }, [transactions, monthStart, monthEnd, currentYear]);

  // Agrupamento de Categorias
  const mapaCategoria = {};
  let valorPassivosTransicao = 0;

  monthTx.filter(t => t.type === 'expense').forEach(t => {
    const slug = String(t.category || 'outros').toLowerCase();

    if (slug === 'passivos_de_transicao') {
      valorPassivosTransicao += t.amount;
      return;
    }
    if (slug === 'retiradas') return;

    if (!mapaCategoria[slug]) mapaCategoria[slug] = 0;
    mapaCategoria[slug] += t.amount;
  });

  // Ordena todas as categorias
  const allCategoryData = Object.entries(mapaCategoria)
    .map(([slug, value]) => ({
      name: getCategoryNameBySlug(slug),
      color: categoryBySlug[slug]?.color || '#94A3B8', 
      value
    }))
    .sort((a, b) => b.value - a.value);

  // Regra de Triagem: Top 6 + "Demais Categorias"
  let categoryData = allCategoryData;
  if (allCategoryData.length > 6) {
    const top6 = allCategoryData.slice(0, 6);
    const othersValue = allCategoryData.slice(6).reduce((sum, item) => sum + item.value, 0);
    categoryData = [
      ...top6,
      { name: 'Demais Categorias', color: '#E2E8F0', value: othersValue } 
    ];
  }

  // Orçado vs Realizado
  const plannedVsActual = useMemo(() => {
    const categoryIdToSlug = new Map(categories.map((category) => [category.id, String(category.slug || '').toLowerCase()]));

    const budgetBySlug = budgets.reduce((acc, budget) => {
      const slug = categoryIdToSlug.get(budget.category_id);
      if (!slug) return acc;
      if (budget.month === currentMonth.getMonth() + 1 && budget.year === currentMonth.getFullYear()) {
        acc[slug] = Number(budget.amount || 0);
      }
      return acc;
    }, {});

    const actualBySlug = monthTx
      .filter((tx) => tx.type === 'expense')
      .reduce((acc, tx) => {
        const slug = String(tx.category || 'outros').toLowerCase();
        if (slug === 'passivos_de_transicao' || slug === 'retiradas') return acc;
        acc[slug] = (acc[slug] || 0) + Number(tx.amount || 0);
        return acc;
      }, {});

    const items = Object.keys({ ...budgetBySlug, ...actualBySlug }).map((slug) => {
      const actual = actualBySlug[slug] || 0;
      const limit = Number(budgetBySlug[slug] || 0);
      const hasLimit = limit > 0;
      const percent = hasLimit ? (actual / limit) * 100 : 0;

      return {
        slug,
        name: getCategoryNameBySlug(slug),
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
  }, [budgets, categories, currentMonth, monthTx, getCategoryNameBySlug]);

  // Resumo Fiscal
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
        <TabsList className="grid w-full grid-cols-2 bg-[#E8EDF2] p-1 rounded-xl">
          <TabsTrigger 
            value="overview" 
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8] transition-all"
          >
            Visão Geral
          </TabsTrigger>
          <TabsTrigger 
            value="audit" 
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8] transition-all"
          >
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          
          <div className="bg-white border-[0.5px] border-[#E8EDF2] border-l-[4px] border-l-[#0D3B66] shadow-[0_1px_4px_rgba(13,59,102,0.06)] rounded-xl py-4 px-[18px] flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[14px] font-bold text-[#0D3B66] mb-0.5">Relatório Consolidado</h3>
              <p className="text-[12px] text-[#7B92A8]">Acesse o fechamento detalhado de {format(currentMonth, 'MMMM/yyyy', { locale: ptBR })}</p>
            </div>
            <button
              onClick={() => setConsolidatedModalOpen(true)}
              className="bg-[#0D3B66] hover:bg-[#0a2f54] text-white border-none rounded-lg py-2 px-4 text-[12px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors shadow-sm"
            >
              Ver Completo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            
            {/* GRÁFICO 1: Fluxo de Caixa */}
            <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5 shadow-[0_1px_4px_rgba(13,59,102,0.06)]">
              <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Fluxo de Caixa — Últimos 6 Meses</h3>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={months} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#F0F4F8" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#7B92A8', fontSize: 11 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#7B92A8', fontSize: 10 }}
                      tickFormatter={v => `R$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(13, 59, 102, 0.05)' }}
                      contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      formatter={(v) => [fmt(v), '']}
                    />
                    <Legend 
                      iconType="circle" 
                      wrapperStyle={{ fontSize: '11px', color: '#7B92A8', paddingTop: '10px' }} 
                    />
                    <Bar dataKey="Receitas" fill="#0FA3A3" radius={[6, 6, 0, 0]} barSize={24} />
                    <Bar dataKey="Despesas" fill="#F08080" radius={[6, 6, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[9px] text-[#7B92A8] italic mt-2.5">* despesas registradas a partir de mai/26</p>
            </Card>

            {/* GRÁFICO 2: Despesas por Categoria (Doughnut) */}
            <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5 shadow-[0_1px_4px_rgba(13,59,102,0.06)]">
              <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Despesas por Categoria (Mês Atual)</h3>
              <div className="relative h-[200px]">
                {categoryData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Nenhuma despesa neste mês</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={categoryData} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius="62%" 
                        outerRadius={80} 
                        dataKey="value"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      >
                        {categoryData.map((item, i) => (
                          <Cell key={item.name || i} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                        itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                        formatter={(value, name) => {
                          const total = categoryData.reduce((acc, curr) => acc + curr.value, 0);
                          const pct = ((value / total) * 100).toFixed(1);
                          return [`${fmt(value)} (${pct}%)`, name];
                        }}
                      />
                      <Legend 
                        iconType="circle" 
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} 
                        formatter={(value) => <span style={{ color: '#7B92A8' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {valorPassivosTransicao > 0 && (
                <div className="mt-4 rounded-r-md border-l-[3px] border-l-[#F0A030] bg-[#FFF8EC] px-3 py-2 text-[11px] text-[#C0622A]">
                  ⚠ Passivos de Transição ({fmt(valorPassivosTransicao)}) excluídos desta visão — categoria temporária de migração
                </div>
              )}
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