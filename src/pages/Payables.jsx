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
import PayableFormModal from '@/components/payables/PayableFormModal';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABELS = { pending: 'Pendente', paid: 'Pago', overdue: 'Vencido' };
const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros',
};

export default function Payables() {
  const [showForm, setShowForm] = useState(false);
  const [confirmingPayable, setConfirmingPayable] = useState(null);
  const [filterMonth, setFilterMonth] = useState(null);
  const [filterBy, setFilterBy] = useState('due_date');
  const queryClient = useQueryClient();

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Payable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Conta removida'); },
  });

  const getStatus = (p) => {
    if (p.status === 'paid') return 'paid';
    if (p.due_date && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date))) return 'overdue';
    return p.status;
  };

  const filtered = filterMonth
    ? payables.filter(p => {
        if (filterBy === 'due_date') {
          if (!p.due_date) return false;
          const d = new Date(p.due_date + 'T12:00:00');
          return d >= startOfMonth(filterMonth) && d <= endOfMonth(filterMonth);
        } else {
          // competencia (created_date)
          if (!p.created_date) return false;
          const d = new Date(p.created_date);
          return d >= startOfMonth(filterMonth) && d <= endOfMonth(filterMonth);
        }
      })
    : payables;

  const totalPending = filtered.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filtered.filter(p => p.status === 'pending').length} pendentes · {fmt(totalPending)} total
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Filtro de mês */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFilterMonth(filterMonth ? subMonths(filterMonth, 1) : subMonths(new Date(), 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant={filterMonth ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterMonth(filterMonth ? null : new Date())}
            className="min-w-[120px] text-sm capitalize"
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
        {filterMonth && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por:</span>
            <Button
              variant={filterBy === 'due_date' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('due_date')}
              className="text-xs"
            >
              Data de Vencimento
            </Button>
            <Button
              variant={filterBy === 'competencia' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('competencia')}
              className="text-xs"
            >
              Competência
            </Button>
          </div>
        )}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada</p>
            )}
            {filtered.map(p => {
              const status = getStatus(p);
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={`w-2 h-10 rounded-full flex-shrink-0 ${status === 'paid' ? 'bg-emerald-400' : status === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{p.description}</p>
                      {p.recurrent && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">Recorrente</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        Venc: {p.due_date ? format(new Date(p.due_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </span>
                      {p.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{CATEGORY_LABELS[p.category] || p.category}</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-red-500">-{fmt(p.amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  {status !== 'paid' && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => setConfirmingPayable(p)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(p.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <PayableFormModal onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }} />
      )}

      {confirmingPayable && (
        <ConfirmPayableModal
          payable={confirmingPayable}
          onClose={() => { setConfirmingPayable(null); queryClient.invalidateQueries(); }}
        />
      )}
    </div>
  );
}