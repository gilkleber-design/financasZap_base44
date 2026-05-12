import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AuditReportAccordion from '@/components/reports/AuditReportAccordion';
import PayableDetailDrawer from '@/components/reports/PayableDetailDrawer';

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
  const [reportViewMode, setReportViewMode] = useState('category');

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

  const handlePayableClick = (payable) => {
    setSelectedPayable(payable);
    setDrawerOpen(true);
  };

  // Filtrar payables pelo mês selecionado
  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);
  const selectedMonthStr = format(currentMonth, 'yyyy-MM');
  
  const filteredPayables = payables.filter(p => {
    const payableMonth = format(new Date(p.due_date), 'yyyy-MM');
    return payableMonth === selectedMonthStr;
  });

  // Last 6 months data (current year only)
  const currentYear = new Date().getFullYear();
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

  // Category breakdown current month (current year only)
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const monthTx = transactions.filter(t => t.date >= monthStart && t.date <= monthEnd && new Date(t.date).getFullYear() === currentYear);

  const expenseByCategory = monthTx
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      const cat = t.category || 'outros';
      acc[cat] = (acc[cat] || 0) + t.amount;
      return acc;
    }, {});

  const categoryData = Object.entries(expenseByCategory)
    .map(([name, value]) => ({ name: CATEGORY_LABELS[name] || name, value }))
    .sort((a, b) => b.value - a.value);

  // Tax report by source (current year only)
  const taxBySource = {};
  transactions.filter(t => t.type === 'income' && t.tax_amount > 0 && new Date(t.date).getFullYear() === currentYear).forEach(t => {
    const key = t.income_source_id || 'Outras';
    if (!taxBySource[key]) taxBySource[key] = { gross: 0, tax: 0, net: 0 };
    taxBySource[key].gross += t.amount;
    taxBySource[key].tax += t.tax_amount;
    taxBySource[key].net += t.net_amount || t.amount;
  });

  const totalTax = Object.values(taxBySource).reduce((s, v) => s + v.tax, 0);
  const totalGross = transactions.filter(t => t.type === 'income' && new Date(t.date).getFullYear() === currentYear).reduce((s, t) => s + t.amount, 0);
  const totalNet = transactions.filter(t => t.type === 'income' && new Date(t.date).getFullYear() === currentYear).reduce((s, t) => s + (t.net_amount || t.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-sora font-bold">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão financeira completa</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">

      {/* Fluxo de Caixa */}
      <Card className="border-0 shadow-sm">
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
        </CardContent>
      </Card>

      {/* Saldo */}
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Saldo Mensal</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={months}>
              <XAxis dataKey="name" />
              <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Line type="monotone" dataKey="Saldo" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category pie */}
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Despesas por Categoria (Mês Atual)</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma despesa neste mês</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tax report */}
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Resumo Fiscal — Impostos Retidos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Bruto</p>
                <p className="text-sm font-bold mt-1">{fmt(totalGross)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-600">Total Impostos</p>
                <p className="text-sm font-bold text-amber-700 mt-1">{fmt(totalTax)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-600">Total Líquido</p>
                <p className="text-sm font-bold text-emerald-700 mt-1">{fmt(totalNet)}</p>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(taxBySource).map(([sourceId, data]) => (
                <div key={sourceId} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                  <span className="font-medium truncate flex-1">{sourceId === 'Outras' ? 'Outras fontes' : sourceId}</span>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-amber-600 font-semibold">{fmt(data.tax)}</span>
                    <span className="text-muted-foreground text-xs ml-1">retido</span>
                  </div>
                </div>
              ))}
              {Object.keys(taxBySource).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum imposto registrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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
            <div className="ml-auto flex gap-2">
              {['category', 'subcategory'].map(mode => (
                <Button
                  key={mode}
                  size="sm"
                  variant={reportViewMode === mode ? 'secondary' : 'outline'}
                  onClick={() => setReportViewMode(mode)}
                  className="text-xs"
                >
                  {mode === 'category' ? 'Por Categoria' : 'Por Subcategoria'}
                </Button>
              ))}
            </div>
          </div>
          <AuditReportAccordion 
            payables={filteredPayables} 
            onRowClick={handlePayableClick} 
            viewMode={reportViewMode}
            categories={categories}
          />
        </TabsContent>
      </Tabs>

      <PayableDetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} payable={selectedPayable} />
    </div>
  );
}