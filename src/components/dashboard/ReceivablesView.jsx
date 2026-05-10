import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, isPast, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

export default function ReceivablesView({ receivables, incomeSources }) {
  const now = new Date();
  const bySource = receivables.reduce((acc, r) => {
    const src = incomeSources.find(s => s.id === r.income_source_id);
    const label = src?.name || 'Outros';
    acc[label] = (acc[label] || 0) + (r.net_amount || r.amount || 0);
    return acc;
  }, {});

  const chartData = Object.entries(bySource).map(([name, value]) => ({ name, value }));

  const received = receivables.filter(r => r.status === 'received');
  const pending = receivables.filter(r => r.status !== 'received');
  const overdue = pending.filter(r => r.due_date && isPast(new Date(r.due_date + 'T12:00:00')) && !isToday(new Date(r.due_date + 'T12:00:00')));

  const totalReceived = received.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);
  const totalPending = pending.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);

  // Lista: pendentes com vencimento <= hoje, ordenada por sigla (descrição antes do '—') e depois por competência
  const dueList = pending
    .filter(r => r.due_date && new Date(r.due_date + 'T12:00:00') <= now)
    .sort((a, b) => {
      const siglaA = (a.description.split('—')[0] || '').trim().toLowerCase();
      const siglaB = (b.description.split('—')[0] || '').trim().toLowerCase();
      if (siglaA !== siglaB) return siglaA.localeCompare(siglaB, 'pt-BR');
      const cA = a.competencia || a.due_date || '';
      const cB = b.competencia || b.due_date || '';
      return cA.localeCompare(cB);
    });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-2.5 md:p-4">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-[10px] md:text-xs font-medium text-emerald-700 leading-tight">Recebido</span>
            </div>
            <p className="text-sm md:text-xl font-bold text-emerald-700">{fmt(totalReceived)}</p>
            <p className="text-[10px] md:text-xs text-emerald-600 mt-0.5">{received.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-2.5 md:p-4">
            <div className="flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3 md:w-4 md:h-4 text-blue-500 flex-shrink-0" />
              <span className="text-[10px] md:text-xs font-medium text-blue-700 leading-tight">Aguardando</span>
            </div>
            <p className="text-sm md:text-xl font-bold text-blue-700">{fmt(totalPending)}</p>
            <p className="text-[10px] md:text-xs text-blue-600 mt-0.5">{pending.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${overdue.length > 0 ? 'bg-red-50' : 'bg-muted/30'}`}>
          <CardContent className="p-2.5 md:p-4">
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 ${overdue.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] md:text-xs font-medium leading-tight ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Atrasado</span>
            </div>
            <p className={`text-sm md:text-xl font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
              {fmt(overdue.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0))}
            </p>
            <p className={`text-[10px] md:text-xs mt-0.5 ${overdue.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{overdue.length} item(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Gráfico por fonte */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Receitas por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma receita encontrada</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={false}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Contas a Receber — vencidas ou vencendo hoje */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Contas a Receber</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
              {dueList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta vencida ou vencendo hoje 🎉</p>
              ) : (
                dueList.map(r => {
                  const isOverdue = isPast(new Date(r.due_date + 'T12:00:00')) && !isToday(new Date(r.due_date + 'T12:00:00'));
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.due_date ? format(new Date(r.due_date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                          {isOverdue && <span className="text-red-500 ml-1">· Vencido</span>}
                          {isToday(new Date(r.due_date + 'T12:00:00')) && <span className="text-amber-600 ml-1">· Hoje</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-600">{fmt(r.net_amount || r.amount)}</span>
                        {r.net_amount > 0 && r.amount > 0 && r.net_amount < r.amount && (
                          <p className="text-[10px] text-muted-foreground/60">{fmt(r.amount)} bruto</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}