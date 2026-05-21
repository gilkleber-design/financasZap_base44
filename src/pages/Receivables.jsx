import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ConfirmReceivableModal from '@/components/dashboard/ConfirmReceivableModal';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ReceivableFormModal from '@/components/receivables/ReceivableFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Receivables() {
  const [showForm, setShowForm] = useState(false);
  const [confirmingReceivable, setConfirmingReceivable] = useState(null);
  const [deletingReceivable, setDeletingReceivable] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open'); // 'open' | 'overdue' | 'received'
  const [filterBy, setFilterBy] = useState('due_date'); // 'due_date' | 'competencia' | 'payment_date'
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

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Receivable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removido'); setDeletingReceivable(null); },
  });

  const undoPaymentMutation = useMutation({
    mutationFn: async (r) => {
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

  // Mapa de receivable_id -> data real do recebimento
  const receivedDateMap = {};
  transactions.forEach(t => {
    if (t.receivable_id) receivedDateMap[t.receivable_id] = t.date;
  });

  // Transactions PF que aparecem como "recebidas"
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

  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);

  // Combina receivables com pfTransactions para o filtro "recebidas"
  const allItems = filterStatus === 'received'
    ? [...receivables, ...pfTransactions]
    : receivables;

  const filtered = allItems.filter(r => {
    const status = getStatus(r);

    // Filtro de status
    if (filterStatus === 'open') {
      if (status === 'received') return false;
    } else if (filterStatus === 'overdue') {
      if (status !== 'overdue') return false;
    } else if (filterStatus === 'received') {
      if (status !== 'received') return false;
    }

    // Para recebidas: filtrar por data de pagamento ou competência
    if (filterStatus === 'received' || status === 'received') {
      let dateField;
      if (filterBy === 'competencia') {
        dateField = r.competencia || r.due_date;
      } else {
        // payment_date (padrão para recebidas)
        dateField = r._isPfTransaction
          ? r.due_date
          : (receivedDateMap[r.id] || r.due_date);
      }
      if (!dateField) return false;
      const d = new Date(dateField + (dateField.includes('T') ? '' : 'T12:00:00'));
      return d >= mStart && d <= mEnd;
    }

    // Para em aberto / vencidas: filtrar por due_date ou competencia
    const dateField = filterBy === 'competencia'
      ? (r.competencia || r.due_date)
      : r.due_date;

    if (!dateField) return false;
    const d = new Date(dateField + (dateField.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return false;
    return d >= mStart && d <= mEnd;
  }).sort((a, b) => {
    const siglaA = (a.description.split('—')[0] || '').trim().toLowerCase();
    const siglaB = (b.description.split('—')[0] || '').trim().toLowerCase();
    if (siglaA !== siglaB) return siglaA.localeCompare(siglaB, 'pt-BR');
    const cA = a.competencia || a.due_date || '';
    const cB = b.competencia || b.due_date || '';
    return cA.localeCompare(cB);
  });

  const totalFiltered = filtered.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);
  const pendingCount = filtered.filter(r => getStatus(r) === 'pending').length;
  const overdueCount = filtered.filter(r => getStatus(r) === 'overdue').length;

  const subtitle = filterStatus === 'open'
    ? `${pendingCount} pendentes · ${overdueCount} vencidas · ${fmt(totalFiltered)} total`
    : filterStatus === 'overdue'
    ? `${filtered.length} vencidas · ${fmt(totalFiltered)} em atraso`
    : `${filtered.length} recebidos · ${fmt(totalFiltered)} recebido`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Contas a Receber</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Filtro de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={filterStatus === 'open' ? 'secondary' : 'outline'} size="sm" onClick={() => { setFilterStatus('open'); setFilterBy('due_date'); }} className="text-xs">
          Em Aberto
        </Button>
        <Button variant={filterStatus === 'overdue' ? 'secondary' : 'outline'} size="sm" onClick={() => { setFilterStatus('overdue'); setFilterBy('due_date'); }} className="text-xs">
          Vencidas
        </Button>
        <Button variant={filterStatus === 'received' ? 'secondary' : 'outline'} size="sm" onClick={() => { setFilterStatus('received'); setFilterBy('payment_date'); }} className="text-xs">
          Recebidas
        </Button>
      </div>

      {/* Filtro de mês + tipo de data */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          {filterStatus === 'received' ? (
            <>
              <Button variant={filterBy !== 'competencia' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('payment_date')} className="text-xs">
                Data de Pagamento
              </Button>
              <Button variant={filterBy === 'competencia' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('competencia')} className="text-xs">
                Competência
              </Button>
            </>
          ) : (
            <>
              <Button variant={filterBy === 'due_date' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('due_date')} className="text-xs">
                Vencimento
              </Button>
              <Button variant={filterBy === 'competencia' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('competencia')} className="text-xs">
                Competência
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada</p>
            )}
            {filtered.map(r => {
              const status = getStatus(r);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={`w-2 h-10 rounded-full flex-shrink-0 ${status === 'received' ? 'bg-emerald-400' : status === 'overdue' ? 'bg-red-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          let dateStr;
                          if (filterStatus === 'received') {
                            if (filterBy === 'competencia') {
                              dateStr = r.competencia || r.due_date;
                            } else {
                              dateStr = r._isPfTransaction ? r.due_date : (receivedDateMap[r.id] || r.due_date);
                            }
                          } else if (filterBy === 'competencia') {
                            dateStr = r.competencia || r.due_date;
                          } else {
                            dateStr = r.due_date;
                          }
                          if (!dateStr) return '—';
                          return format(new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00')), 'dd/MM/yyyy', { locale: ptBR });
                        })()}
                      </span>
                      {r.recurrent && !r._isPfTransaction && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">Recorrente</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {status !== 'received' && !r._isPfTransaction && (
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => setConfirmingReceivable(r)}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                    {status === 'received' && !r._isPfTransaction && (
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-amber-500 hover:text-amber-700" title="Desfazer recebimento" onClick={() => undoPaymentMutation.mutate(r)}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    )}
                    {!r._isPfTransaction && (
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => setDeletingReceivable(r)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 min-w-[90px]">
                    <p className="text-sm font-semibold text-emerald-600">+{fmt(r.net_amount || r.amount)}</p>
                    {r.net_amount && r.net_amount < r.amount && <p className="text-xs text-muted-foreground/60">{fmt(r.amount)} bruto</p>}
                    <span className={`text-xs font-medium ${status === 'received' ? 'text-emerald-600' : status === 'overdue' ? 'text-red-500' : 'text-blue-500'}`}>
                      {status === 'received' ? 'Recebido' : status === 'overdue' ? 'Atrasado' : 'Aguardando'}
                    </span>
                  </div>
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

      {deletingReceivable && (
        <AlertDialog open onOpenChange={() => setDeletingReceivable(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta a receber?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deletingReceivable.description}"
                {deletingReceivable.status === 'received' && (
                  <span className="block mt-1 text-amber-600 font-medium">⚠️ Esta conta já foi recebida. A transação vinculada NÃO será removida automaticamente.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate(deletingReceivable.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Removendo...' : 'Excluir'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}