import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ReceivableFormModal from '@/components/receivables/ReceivableFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Receivables() {
  const [showForm, setShowForm] = useState(false);
  const [filterMonth, setFilterMonth] = useState(null); // null = todos
  const queryClient = useQueryClient();

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 200),
  });

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const markReceivedMutation = useMutation({
    mutationFn: (id) => base44.entities.Receivable.update(id, { status: 'received' }),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Marcado como recebido!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Receivable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removido'); },
  });

  const getStatus = (r) => {
    if (r.status === 'received') return 'received';
    if (r.due_date && isPast(new Date(r.due_date)) && !isToday(new Date(r.due_date))) return 'overdue';
    return r.status;
  };

  const filtered = filterMonth
    ? receivables.filter(r => {
        if (!r.due_date) return false;
        const d = new Date(r.due_date + 'T12:00:00');
        return d >= startOfMonth(filterMonth) && d <= endOfMonth(filterMonth);
      })
    : receivables;

  const totalPending = filtered.filter(r => r.status === 'pending').reduce((s, r) => s + (r.net_amount || r.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Contas a Receber</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filtered.filter(r => r.status === 'pending').length} pendentes · {fmt(totalPending)} a receber
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Filtro de mês */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFilterMonth(filterMonth ? subMonths(filterMonth, 1) : subMonths(new Date(), 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant={filterMonth ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilterMonth(filterMonth ? null : new Date())}
          className="min-w-[120px] text-sm"
        >
          {filterMonth ? format(filterMonth, 'MMMM yyyy', { locale: ptBR }) : 'Todos os meses'}
        </Button>
        {filterMonth && (
          <Button variant="outline" size="sm" onClick={() => setFilterMonth(addMonths(filterMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
        {filterMonth && (
          <Button variant="ghost" size="sm" onClick={() => setFilterMonth(null)} className="text-muted-foreground text-xs">
            Limpar
          </Button>
        )}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada</p>
            )}
            {filtered.map(r => {
              const status = getStatus(r);
              const source = incomeSources.find(s => s.id === r.income_source_id);
              return (
                <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={`w-2 h-10 rounded-full flex-shrink-0 ${status === 'received' ? 'bg-emerald-400' : status === 'overdue' ? 'bg-red-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{r.description}</p>
                      {r.recurrent && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">Recorrente</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        Previsto: {r.due_date ? format(new Date(r.due_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </span>
                      {source && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{source.name} ({source.type.toUpperCase()})</Badge>}
                      {r.tax_rate > 0 && <Badge className="text-xs py-0 h-4 px-1.5 bg-amber-100 text-amber-700 border-0">IR {r.tax_rate}%</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-600">+{fmt(r.net_amount || r.amount)}</p>
                    {r.tax_rate > 0 && <p className="text-xs text-muted-foreground">Bruto: {fmt(r.amount)}</p>}
                    <span className={`text-xs font-medium ${status === 'received' ? 'text-emerald-600' : status === 'overdue' ? 'text-red-500' : 'text-blue-500'}`}>
                      {status === 'received' ? 'Recebido' : status === 'overdue' ? 'Atrasado' : 'Aguardando'}
                    </span>
                  </div>
                  {status !== 'received' && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => markReceivedMutation.mutate(r.id)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(r.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <ReceivableFormModal
          incomeSources={incomeSources}
          onClose={() => setShowForm(false)}
          onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }}
        />
      )}
    </div>
  );
}