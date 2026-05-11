import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Edit2, Undo2 } from 'lucide-react';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, isSameYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import PayableFormModal from '@/components/payables/PayableFormModal';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditPayableModal from '@/components/payables/EditPayableModal';

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
  const [editingPayable, setEditingPayable] = useState(null);
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [deleteMode, setDeleteMode] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open'); // 'open' | 'overdue' | 'paid'
  const [filterBy, setFilterBy] = useState('due_date'); // 'due_date' | 'competencia'
  const queryClient = useQueryClient();

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 200),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Payable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Conta removida'); },
  });

  const deletePayablesMutation = useMutation({
    mutationFn: async (payable) => {
      const allPayables = await base44.entities.Payable.list('-due_date', 500);
      const toDelete = allPayables.filter(p => p.description === payable.description && p.due_date);

      if (deleteMode === 'this') {
        const next = toDelete.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
        if (next) await base44.entities.Payable.delete(next.id);
      } else if (deleteMode === 'all') {
        for (const p of toDelete) await base44.entities.Payable.delete(p.id);
      } else if (deleteMode === 'forward') {
        const now = new Date();
        for (const p of toDelete) {
          const d = new Date(p.due_date);
          if (!isNaN(d.getTime()) && d >= now) await base44.entities.Payable.delete(p.id);
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Lançamentos removidos'); },
  });

  const undoPaymentMutation = useMutation({
    mutationFn: async (p) => {
      if (p.transaction_id) await base44.entities.Transaction.delete(p.transaction_id);
      await base44.entities.Payable.update(p.id, { status: 'pending', transaction_id: null });
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Pagamento desfeito!'); },
  });

  const handleDelete = async () => {
    if (!deleteMode) return;
    await deletePayablesMutation.mutateAsync(deletingPayable);
    setDeletingPayable(null);
    setDeleteMode(null);
  };

  const getStatus = (p) => {
    if (p.status === 'paid') return 'paid';
    if (p.due_date) {
      const d = new Date(p.due_date);
      if (!isNaN(d.getTime()) && isPast(d) && !isToday(d)) return 'overdue';
    }
    return p.status;
  };

  // Mapa de payable_id -> data real do pagamento
  const paidDateMap = {};
  transactions.forEach(t => {
    if (t.payable_id) paidDateMap[t.payable_id] = t.date;
  });

  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);

  const filtered = payables.filter(p => {
    // Filtro de status
    const status = getStatus(p);
    if (filterStatus === 'open') {
      if (status === 'paid') return false;
    } else if (filterStatus === 'overdue') {
      if (status !== 'overdue') return false;
    } else if (filterStatus === 'paid') {
      if (status !== 'paid') return false;
    }

    // Para pagas: filtrar pela data real do pagamento
    if (filterStatus === 'paid' || status === 'paid') {
      const payDate = paidDateMap[p.id] || p.due_date;
      if (!payDate) return false;
      const d = new Date(payDate + (payDate.includes('T') ? '' : 'T12:00:00'));
      return d >= mStart && d <= mEnd;
    }

    // Para em aberto / vencidas: filtrar por due_date ou competencia
    const dateField = filterBy === 'competencia'
      ? (p.competencia || p.due_date)
      : p.due_date;

    if (!dateField) return false;
    const d = new Date(dateField + (dateField.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return false;
    return d >= mStart && d <= mEnd;
  });

  const totalFiltered = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingCount = filtered.filter(p => getStatus(p) === 'pending').length;
  const overdueCount = filtered.filter(p => getStatus(p) === 'overdue').length;

  const subtitle = filterStatus === 'open'
    ? `${pendingCount} pendentes · ${overdueCount} vencidas · ${fmt(totalFiltered)} total`
    : filterStatus === 'overdue'
    ? `${filtered.length} vencidas · ${fmt(totalFiltered)} em atraso`
    : `${filtered.length} pagas · ${fmt(totalFiltered)} pago`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Filtro de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={filterStatus === 'open' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus('open')} className="text-xs">
          Em Aberto
        </Button>
        <Button variant={filterStatus === 'overdue' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus('overdue')} className="text-xs">
          Vencidas
        </Button>
        <Button variant={filterStatus === 'paid' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus('paid')} className="text-xs">
          Pagas
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
        {filterStatus !== 'paid' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por:</span>
            <Button variant={filterBy === 'due_date' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('due_date')} className="text-xs">
              Vencimento
            </Button>
            <Button variant={filterBy === 'competencia' ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy('competencia')} className="text-xs">
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
                  <div className="relative group/bullet flex-shrink-0">
                    <div className={`w-2 h-10 rounded-full ${status === 'paid' ? 'bg-emerald-400 cursor-pointer' : status === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    {status === 'paid' && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden group-hover/bullet:block">
                        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs min-w-[180px] space-y-1">
                          <p className="font-semibold text-emerald-600">✓ Pago</p>
                          {p.amount && <p className="text-muted-foreground">Valor: <span className="font-medium text-foreground">{fmt(p.amount)}</span></p>}
                          {p.transaction_id && <p className="text-muted-foreground text-[10px]">Lançamento vinculado</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{p.description}</p>
                      {p.recurrent && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">Recorrente</Badge>}
                    </div>
                    {p.due_date && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const d = new Date(p.due_date);
                            return isNaN(d.getTime()) ? 'Venc: —' : `Venc: ${format(d, 'dd/MM/yyyy', { locale: ptBR })}`;
                          })()}
                        </span>
                        {p.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{CATEGORY_LABELS[p.category] || p.category}</Badge>}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-red-500">-{fmt(p.amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-500 hover:text-slate-700" onClick={() => setEditingPayable(p)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {status !== 'paid' && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => setConfirmingPayable(p)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  {status === 'paid' && (
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-amber-500 hover:text-amber-700" title="Desfazer pagamento" onClick={() => undoPaymentMutation.mutate(p)}>
                      <Undo2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => setDeletingPayable(p)}>
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

      {editingPayable && (
        <EditPayableModal
          payable={editingPayable}
          onClose={() => setEditingPayable(null)}
          onSaved={() => { setEditingPayable(null); queryClient.invalidateQueries(); }}
        />
      )}

      {deletingPayable && !deleteMode && (
        <AlertDialog open onOpenChange={() => setDeletingPayable(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{deletingPayable.description}"?</AlertDialogTitle>
              <AlertDialogDescription>Escolha como deseja proceder:</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-left" onClick={() => setDeleteMode('this')}>
                <span className="font-medium">Apenas este mês</span>
                <span className="block text-xs text-muted-foreground">Remove só a próxima parcela</span>
              </Button>
              <Button variant="outline" className="w-full justify-start text-left" onClick={() => setDeleteMode('forward')}>
                <span className="font-medium">Daqui em diante</span>
                <span className="block text-xs text-muted-foreground">Mantém passadas, remove futuras</span>
              </Button>
              <Button variant="outline" className="w-full justify-start text-left text-red-500" onClick={() => setDeleteMode('all')}>
                <span className="font-medium">Todas as parcelas</span>
                <span className="block text-xs text-muted-foreground">Deleta todas as contas com esse nome</span>
              </Button>
            </div>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deletingPayable && deleteMode && (
        <AlertDialog open onOpenChange={() => { setDeletingPayable(null); setDeleteMode(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteMode === 'this' && 'Vai remover apenas a próxima parcela de "' + deletingPayable.description + '"'}
                {deleteMode === 'forward' && 'Vai remover todos os lançamentos futuros de "' + deletingPayable.description + '"'}
                {deleteMode === 'all' && 'Vai remover TODAS as parcelas de "' + deletingPayable.description + '"'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deletePayablesMutation.isPending}>
                Remover
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}