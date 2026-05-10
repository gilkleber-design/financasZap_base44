import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, isPast, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

const now = new Date();
const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

export default function ReceivablesView({ receivables, incomeSources }) {
  const bySource = receivables.reduce((acc, r) => {
    const src = incomeSources.find(s => s.id === r.income_source_id);
    const label = src?.name || 'Outros';
    acc[label] = (acc[label] || 0) + (r.net_amount || r.amount || 0);
    return acc;
  }, {});

  const chartData = Object.entries(bySource).map(([name, value]) => ({ name, value }));

  const totalExpected = receivables.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);
  const received = receivables.filter(r => r.status === 'received');
  const pending = receivables.filter(r => r.status !== 'received');
  const overdue = pending.filter(r => r.due_date && isPast(new Date(r.due_date + 'T12:00:00')) && !isToday(new Date(r.due_date + 'T12:00:00')));

  const totalReceived = received.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);
  const totalPending = pending.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">Já Recebido</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalReceived)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{received.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-700">Aguardando</span>
            </div>
            <p className="text-xl font-bold text-blue-700">{fmt(totalPending)}</p>
            <p className="text-xs text-blue-600 mt-0.5">{pending.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${overdue.length > 0 ? 'bg-red-50' : 'bg-muted/30'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`w-4 h-4 ${overdue.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Atrasado</span>
            </div>
            <p className={`text-xl font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
              {fmt(overdue.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0))}
            </p>
            <p className={`text-xs mt-0.5 ${overdue.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{overdue.length} item(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico por fonte */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Receitas por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma receita encontrada</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lista de contas a receber pendentes */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pendentes de Recebimento</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[220px] overflow-y-auto">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Tudo recebido!</p>
              ) : (
                pending.slice(0, 8).map(r => {
                  const isOverdue = r.due_date && isPast(new Date(r.due_date + 'T12:00:00')) && !isToday(new Date(r.due_date + 'T12:00:00'));
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-blue-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.due_date ? format(new Date(r.due_date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                          {isOverdue && <span className="text-red-500 ml-1">· Atrasado</span>}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 flex-shrink-0">{fmt(r.net_amount || r.amount)}</span>
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