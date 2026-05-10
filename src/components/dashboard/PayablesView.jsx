import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, isPast, isToday } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#22c55e'];

const categoryLabels = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros',
};

export default function PayablesView({ payables }) {
  const pending = payables.filter(p => p.status !== 'paid');
  const paid = payables.filter(p => p.status === 'paid');
  const overdue = pending.filter(p => p.due_date && isPast(new Date(p.due_date + 'T12:00:00')) && !isToday(new Date(p.due_date + 'T12:00:00')));

  const totalPending = pending.reduce((s, p) => s + p.amount, 0);
  const totalPaid = paid.reduce((s, p) => s + p.amount, 0);
  const totalOverdue = overdue.reduce((s, p) => s + p.amount, 0);

  const byCategory = pending.reduce((acc, p) => {
    const cat = categoryLabels[p.category] || 'Outros';
    acc[cat] = (acc[cat] || 0) + p.amount;
    return acc;
  }, {});
  const chartData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Totalizadores */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-amber-700">A Pagar</span>
            </div>
            <p className="text-xl font-bold text-amber-700">{fmt(totalPending)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{pending.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">Já Pago</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalPaid)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{paid.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${overdue.length > 0 ? 'bg-red-50' : 'bg-muted/30'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`w-4 h-4 ${overdue.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Atrasado</span>
            </div>
            <p className={`text-xl font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{fmt(totalOverdue)}</p>
            <p className={`text-xs mt-0.5 ${overdue.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{overdue.length} item(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico por categoria */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Despesas Pendentes por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma despesa pendente</p>
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

        {/* Lista de contas a pagar pendentes */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Próximas a Vencer</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[220px] overflow-y-auto">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta pendente!</p>
              ) : (
                [...pending]
                  .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                  .slice(0, 8)
                  .map(p => {
                    const isOverdue = p.due_date && isPast(new Date(p.due_date + 'T12:00:00')) && !isToday(new Date(p.due_date + 'T12:00:00'));
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.due_date ? format(new Date(p.due_date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                            {isOverdue && <span className="text-red-500 ml-1">· Atrasado</span>}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-red-600 flex-shrink-0">{fmt(p.amount)}</span>
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