import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import ConfirmReceivableModal from '@/components/dashboard/ConfirmReceivableModal';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ReceivableFormModal from '@/components/receivables/ReceivableFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Receivables() {
  const [showForm, setShowForm] = useState(false);
  const [confirmingReceivable, setConfirmingReceivable] = useState(null);
  const [filterMonth, setFilterMonth] = useState(null); // null = todos
  const [filterBy, setFilterBy] = useState('due_date'); // 'due_date' ou 'competencia'
  const [filterStatus, setFilterStatus] = useState('open'); // 'open' = em aberto | 'received' = pagas | 'all' = todas
  const queryClient = useQueryClient();

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 200),
  });

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const { data: hospitals = [] } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => base44.entities.Hospital.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  // Transactions de salário/bolsa que serão exibidas como "recebidas" na lista
  const pfTransactions = transactions.filter(t =>
    t.type === 'income' &&
    (t.category === 'salario_clt' ||
      t.description?.toLowerCase().includes('bolsa') ||
      t.description?.toLowerCase().includes('salário') ||
      t.description?.toLowerCase().includes('salario'))
  ).map(t => ({
    id: `tx-${t.id}`,
    description: t.description,
    amount: t.amount,
    net_amount: t.net_amount || t.amount,
    due_date: t.date,
    competencia: t.date,
    status: 'received',
    _isPfTransaction: true,
  }));



  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Receivable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removido'); },
  });

  const undoPaymentMutation = useMutation({
    mutationFn: async (r) => {
      // Remove o lançamento vinculado (se existir) e reverte o recebível para pending
      if (r.transaction_id) await base44.entities.Transaction.delete(r.transaction_id);
      await base44.entities.Receivable.update(r.id, { status: 'pending', transaction_id: null });
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Pagamento desfeito!'); },
  });

  const getStatus = (r) => {
    if (r.status === 'received') return 'received';
    if (r.due_date && isPast(new Date(r.due_date)) && !isToday(new Date(r.due_date))) return 'overdue';
    return r.status;
  };

  // Helper: nome do hospital para um recebível (via income_source_id)
  const hospitalName = (r) => {
    const hosp = hospitals.find(h => h.income_source_id === r.income_source_id);
    if (hosp) return hosp.sigla || hosp.name;
    const src = incomeSources.find(s => s.id === r.income_source_id);
    return src?.name || '';
  };

  // Mescla receivables com pfTransactions quando filtro for 'received' ou 'all'
  const allItems = filterStatus === 'open'
    ? receivables
    : filterStatus === 'received'
    ? [...receivables.filter(r => r.status === 'received'), ...pfTransactions]
    : [...receivables, ...pfTransactions];

  const filtered = allItems
    .filter(r => {
      // filtro de status
      if (filterStatus === 'open') return r.status !== 'received';
      if (filterStatus === 'received') return r.status === 'received';
      return true;
    })
    .filter(r => {
      if (!filterMonth) return true;
      if (filterBy === 'due_date') {
        if (!r.due_date) return false;
        const d = new Date(r.due_date + 'T12:00:00');
        return d >= startOfMonth(filterMonth) && d <= endOfMonth(filterMonth);
      } else {
        const raw = r.competencia || r.due_date;
        if (!raw) return false;
        const d = new Date(raw + 'T12:00:00');
        return d >= startOfMonth(filterMonth) && d <= endOfMonth(filterMonth);
      }
    })
    .sort((a, b) => {
      // Extrai a sigla do hospital da descrição (tudo antes do " —")
      const siglaA = (a.description.split('—')[0] || '').trim().toLowerCase();
      const siglaB = (b.description.split('—')[0] || '').trim().toLowerCase();
      if (siglaA !== siglaB) return siglaA.localeCompare(siglaB, 'pt-BR');
      // depois por competência (ou due_date como fallback)
      const cA = a.competencia || a.due_date || '';
      const cB = b.competencia || b.due_date || '';
      return cA.localeCompare(cB);
    });

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

      {/* Filtro de status */}
      <div className="flex items-center gap-2">
        <Button
          variant={filterStatus === 'open' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('open')}
          className="text-xs"
        >
          Em Aberto
        </Button>
        <Button
          variant={filterStatus === 'received' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('received')}
          className="text-xs"
        >
          Recebidas
        </Button>
        <Button
          variant={filterStatus === 'all' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('all')}
          className="text-xs"
        >
          Todas
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
            {filtered.map(r => {
              const status = getStatus(r);
              const source = incomeSources.find(s => s.id === r.income_source_id);
              return (
                <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={`w-2 h-10 rounded-full flex-shrink-0 ${status === 'received' ? 'bg-emerald-400' : status === 'overdue' ? 'bg-red-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {r.due_date ? format(new Date(r.due_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </span>
                      {r.recurrent && !r._isPfTransaction && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">Recorrente</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-600">+{fmt(r.net_amount || r.amount)}</p>
                    {r.net_amount && r.net_amount < r.amount && <p className="text-xs text-muted-foreground/60">{fmt(r.amount)} bruto</p>}
                    <span className={`text-xs font-medium ${status === 'received' ? 'text-emerald-600' : status === 'overdue' ? 'text-red-500' : 'text-blue-500'}`}>
                      {status === 'received' ? 'Recebido' : status === 'overdue' ? 'Atrasado' : 'Aguardando'}
                    </span>
                  </div>
                  {status !== 'received' && !r._isPfTransaction && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => setConfirmingReceivable(r)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  {status === 'received' && !r._isPfTransaction && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-amber-500 hover:text-amber-700" title="Desfazer pagamento" onClick={() => undoPaymentMutation.mutate(r)}>
                      <Undo2 className="w-4 h-4" />
                    </Button>
                  )}
                  {!r._isPfTransaction && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(r.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
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

      {confirmingReceivable && (
        <ConfirmReceivableModal
          receivable={confirmingReceivable}
          onClose={() => {
            setConfirmingReceivable(null);
            queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}