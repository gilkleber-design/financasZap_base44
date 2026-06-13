import { useMemo, useState, useCallback, useEffect } from 'react';

const USE_NEW_REPORT_DATA = false;
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

  const searchParams = new URLSearchParams(window.location.search);
  const verifyMode = searchParams.get('verify') === '1';
  const debugMode = searchParams.get('debug') === '1';
  const [debugData, setDebugData] = useState(null);
  const [isDebugLoading, setIsDebugLoading] = useState(false);

  const runDebug = async () => {
    setIsDebugLoading(true);
    try {
      const res = await base44.functions.invoke('debugMayExpenses');
      setDebugData(res.data);
    } catch (e) {
      alert("Error: " + e.message);
    }
    setIsDebugLoading(false);
  };

  const { data: newReportRes } = useQuery({
    queryKey: ['reportData', currentMonth.getMonth() + 1, currentMonth.getFullYear()],
    queryFn: () => base44.functions.invoke('getReportData', { month: currentMonth.getMonth() + 1, year: currentMonth.getFullYear() }),
    enabled: USE_NEW_REPORT_DATA || verifyMode,
  });
  const newReport = newReportRes?.data;

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
    if (p.is_card_invoice_payable) return false; // fatura consolidada: itens já contam individualmente
    // Parcelas de cartão competem no vencimento de cada parcela; demais usam competencia.
    const ref = p.installment_group_id ? p.due_date : (p.competencia || p.due_date);
    const payableMonth = format(new Date(ref), 'yyyy-MM');
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

  // Parcelas/contas de CARTÃO do mês (regime de competência).
  // Compras parceladas no cartão viram Payable (sem Transaction), então
  // precisam ser somadas às despesas por categoria pela competência.
  const cardPayablesThisMonth = useMemo(() => {
    return payables.filter(p => {
      if (p.origin_type !== 'card') return false;
      if (p.is_card_invoice_payable) return false; // ignora a fatura consolidada (evita dupla contagem)
      // Parcelas de cartão competem no mês do vencimento de cada parcela (due_date),
      // pois a competencia costuma vir igual à data da compra em todas as parcelas.
      const ref = p.installment_group_id ? p.due_date : (p.competencia || p.due_date);
      if (!ref) return false;
      return format(new Date(ref), 'yyyy-MM') === selectedMonthStr;
    });
  }, [payables, selectedMonthStr]);

  // Agrupamento de Categorias
  const mapaCategoria = {};
  let valorPassivosTransicao = 0;

  const acumularDespesa = (slug, amount) => {
    if (slug === 'passivos_de_transicao') {
      valorPassivosTransicao += amount;
      return;
    }
    if (slug === 'retiradas') return;
    if (!mapaCategoria[slug]) mapaCategoria[slug] = 0;
    mapaCategoria[slug] += amount;
  };

  monthTx.filter(t => t.type === 'expense').forEach(t => {
    acumularDespesa(String(t.category || 'outros').toLowerCase(), t.amount || 0);
  });

  cardPayablesThisMonth.forEach(p => {
    acumularDespesa(String(p.category || 'outros').toLowerCase(), p.amount || 0);
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

    // Inclui parcelas/contas de cartão do mês (competência) no realizado
    cardPayablesThisMonth.forEach((p) => {
      const slug = String(p.category || 'outros').toLowerCase();
      if (slug === 'passivos_de_transicao' || slug === 'retiradas') return;
      actualBySlug[slug] = (actualBySlug[slug] || 0) + Number(p.amount || 0);
    });

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
  }, [budgets, categories, currentMonth, monthTx, getCategoryNameBySlug, cardPayablesThisMonth]);

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

  // --- ADAPTERS INLINE ---
  const adaptToLegacyPlannedItems = (byCategory) => {
    if (!byCategory) return [];
    const budgetBySlug = budgets.reduce((acc, budget) => {
      const categoryIdToSlug = new Map(categories.map((category) => [category.id, String(category.slug || '').toLowerCase()]));
      const slug = categoryIdToSlug.get(budget.category_id);
      if (slug && budget.month === currentMonth.getMonth() + 1 && budget.year === currentMonth.getFullYear()) {
        acc[slug] = Number(budget.amount || 0);
      }
      return acc;
    }, {});
    
    const flattenCategories = (cats) => {
        let result = [];
        cats.forEach(c => {
           result.push(c);
           if (c.children) result.push(...flattenCategories(c.children));
        });
        return result;
    };
    
    const allCats = flattenCategories(byCategory);
    
    const items = allCats.map(cat => {
      const slug = cat.slug;
      const actual = cat.paid;
      const limit = Number(budgetBySlug[slug] || 0);
      const hasLimit = limit > 0;
      const percent = hasLimit ? (actual / limit) * 100 : 0;
      return { slug, name: cat.name, actual, limit, hasLimit, percent };
    });
    
    return items.sort((a, b) => {
      if (a.hasLimit && b.hasLimit) return b.percent - a.percent;
      if (a.hasLimit) return -1;
      if (b.hasLimit) return 1;
      return b.actual - a.actual;
    });
  };

  const adaptCashflow = (report) => {
    if (!report?.cashflow_6m) return [];
    return report.cashflow_6m.map(m => ({
      name: m.label.split('/')[0],
      Receitas: m.income_net,
      Despesas: m.expense_gross,
      Saldo: m.balance
    }));
  };

  const adaptCategoryData = (byCategory) => {
    if (!byCategory) return [];
    const all = byCategory.map(c => ({
      name: c.name,
      color: c.color || '#94A3B8',
      value: c.paid
    })).filter(c => c.value > 0).sort((a,b) => b.value - a.value);
    
    if (all.length > 6) {
      const top6 = all.slice(0, 6);
      const others = all.slice(6).reduce((s, i) => s + i.value, 0);
      return [...top6, { name: 'Demais Categorias', color: '#E2E8F0', value: others }];
    }
    return all;
  };

  const adaptFiscalSummary = (report) => {
    if (!report?.fiscal) return { totalGross: 0, totalTax: 0, totalNet: 0, effectiveRate: '0.0%', sourceRows: [] };
    const f = report.fiscal;
    const sourceRows = (f.by_source || [])
      .map(s => ({ name: s.source_name, tax: s.tax_amount }))
      .sort((a, b) => b.tax - a.tax);
    return {
      totalGross: f.total_gross,
      totalTax: f.total_tax,
      totalNet: f.total_net,
      effectiveRate: f.effective_rate,
      sourceRows
    };
  };

  const adaptAuditData = (report) => {
    if (!report?.expense?.items) return [];
    return report.expense.items.map(item => ({
      ...item,
      is_orphan: item._model === 'Transaction'
    }));
  };

  const displayAuditData = USE_NEW_REPORT_DATA && newReport ? adaptAuditData(newReport) : auditData;
  const displayMonths = USE_NEW_REPORT_DATA && newReport ? adaptCashflow(newReport) : months;
  const displayCategoryData = USE_NEW_REPORT_DATA && newReport ? adaptCategoryData(newReport.expense.by_category) : categoryData;
  const displayPlannedVsActual = USE_NEW_REPORT_DATA && newReport ? adaptToLegacyPlannedItems(newReport.expense.by_category) : plannedVsActual;
  const displayFiscal = USE_NEW_REPORT_DATA && newReport ? adaptFiscalSummary(newReport) : { totalGross, totalTax, totalNet, effectiveRate, sourceRows };

  // --- VERIFY MODE ---
  useEffect(() => {
    if (verifyMode && newReport) {
      console.log("=== INICIANDO VERIFY MODE ===");
      
      // 1. Expense Realized
      const legacyExpense = allCategoryData.reduce((sum, c) => sum + c.value, 0);
      const newExpense = newReport.expense.realized_total;
      if (Math.abs(legacyExpense - newExpense) > 0.01) {
        console.warn(`[VERIFY] Divergência em Expense Realized. Legacy: ${legacyExpense}, Novo: ${newExpense}`);
      }

      // 2. Income Realized
      const legacyIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + (t.net_amount !== undefined ? t.net_amount : t.amount || 0), 0);
      const newIncome = newReport.income.realized_total;
      if (Math.abs(legacyIncome - newIncome) > 0.01) {
        console.warn(`[VERIFY] Divergência em Income Realized. Legacy: ${legacyIncome}, Novo: ${newIncome}`);
      }

      // 3. Expense Expected - REMOVIDO
      // (Legacy usa limites do budget, Novo usa soma de Payables. Não são comparáveis).

      // 4. Fiscal
      if (Math.abs(totalGross - newReport.fiscal.total_gross) > 0.01) {
        console.warn(`[VERIFY] Divergência em Fiscal Gross. Legacy: ${totalGross}, Novo: ${newReport.fiscal.total_gross}`);
      }
      if (Math.abs(totalNet - newReport.fiscal.total_net) > 0.01) {
        console.warn(`[VERIFY] Divergência em Fiscal Net. Legacy: ${totalNet}, Novo: ${newReport.fiscal.total_net}`);
      }

      // 5. Cashflow 6 Meses Completo
      for (let i = 0; i < 6; i++) {
        const lCash = months[i];
        const nCash = newReport.cashflow_6m[i];
        if (lCash && nCash) {
           if (Math.abs(lCash.Receitas - nCash.income_net) > 0.01) {
              console.warn(`[VERIFY] Divergência em Cashflow Receitas (${lCash.name}). Legacy: ${lCash.Receitas}, Novo: ${nCash.income_net}`);
           }
           if (Math.abs(lCash.Despesas - nCash.expense_gross) > 0.01) {
              console.warn(`[VERIFY] Divergência em Cashflow Despesas (${lCash.name}). Legacy: ${lCash.Despesas}, Novo: ${nCash.expense_gross}`);
           }
        }
      }

      // 6. Planned vs Actual by Category
      plannedVsActual.forEach(lItem => {
        const nItem = displayPlannedVsActual.find(n => n.slug === lItem.slug);
        if (nItem) {
           if (Math.abs(lItem.actual - nItem.actual) > 0.01) {
              console.warn(`[VERIFY] Categoria "${lItem.name}" divergência em Actual. Legacy: ${lItem.actual}, Novo: ${nItem.actual}`);
           }
        }
      });
      
      console.log("=== FIM VERIFY MODE ===");
    }
  }, [verifyMode, newReport, allCategoryData, totalGross, totalNet, months, monthTx, plannedVsActual, displayPlannedVsActual]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold">Relatórios</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão financeira completa</p>
        </div>
        <Button onClick={runDebug} disabled={isDebugLoading} className="bg-amber-500 hover:bg-amber-600 text-white">
          {isDebugLoading ? 'Carregando...' : '🐛 Debug Maio'}
        </Button>
      </div>

      {debugData && (
        <div className="bg-slate-900 text-green-400 p-4 rounded-xl overflow-auto text-xs font-mono max-h-[400px] w-full mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white font-bold text-sm">Resultados do Debug de Maio</span>
            <Button size="sm" variant="ghost" className="text-white hover:bg-slate-800" onClick={() => setDebugData(null)}>Fechar</Button>
          </div>
          <pre>{JSON.stringify(debugData, null, 2)}</pre>
        </div>
      )}

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
                  <BarChart data={displayMonths} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
                {displayCategoryData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Nenhuma despesa neste mês</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={displayCategoryData} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius="62%" 
                        outerRadius={80} 
                        dataKey="value"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      >
                        {displayCategoryData.map((item, i) => (
                          <Cell key={item.name || i} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                        itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                        formatter={(value, name) => {
                          const total = displayCategoryData.reduce((acc, curr) => acc + curr.value, 0);
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

          <OverviewPlannedVsActual items={displayPlannedVsActual} currentMonth={currentMonth} />

          <OverviewFiscalSummary
            totalGross={displayFiscal.totalGross}
            totalTax={displayFiscal.totalTax}
            totalNet={displayFiscal.totalNet}
            effectiveRate={displayFiscal.effectiveRate}
            sourceRows={displayFiscal.sourceRows}
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

          <AuditCategoryPieChart auditData={displayAuditData} categories={categories} />

          <AuditReportAccordion 
             payables={displayAuditData} 
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