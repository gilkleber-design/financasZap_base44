import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [filterMonth, setFilterMonth] = useState(new Date());
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [deleteMode, setDeleteMode] = useState(null);
  const queryClient = useQueryClient();

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 200),
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
        const next = toDelete.sort((a, b) => {
          const dA = new Date(a.due_date + 'T12:00:00');
          const dB = new Date(b.due_date + 'T12:00:00');
          return dA - dB;
        })[0];
        if (next) await base44.entities.Payable.delete(next.id);
      } else if (deleteMode === 'all') {
        for (const p of toDelete) await base44.entities.Payable.delete(p.id);
      } else if (deleteMode === 'forward') {
        const now = new Date();
        for (const p of toDelete) {
          const d = new Date(p.due_date + 'T12:00:00');
          if (!isNaN(d.getTime()) && d >= now) await base44.entities.Payable.delete(p.id);
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Lançamentos removidos'); },
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
      const d = new Date(p.due_date + 'T12:00:00');
      if (!isNaN(d.getTime()) && isPast(d) && !isToday(d)) return 'overdue';
    }
    return p.status;
  };

  const filtered = payables.filter(p => {
    if (!p.due_date) return false;
    const d = new Date(p.due_date + 'T12:00:00');
    if (isNaN(d.getTime())) return false;
    // Se filterMonth está setado, filtrar pelo mês específico
    if (filterMonth) {
      const mStart = startOfMonth(filterMonth);
      const mEnd = endOfMonth(filterMonth);
      return d >= mStart && d <= mEnd;
    }
    // Senão, mostrar todos os registros válidos
    return true;
  });

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
          <Button variant="outline" size="sm" onClick={() => setDisplayMonth(subMonths(displayMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilterMonth(displayMonth)}
            className="min-w-[160px] text-sm capitalize"
          >
            {format(displayMonth, 'MMMM yyyy', { locale: ptBR })}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant={filterMonth ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setFilterMonth(null)}
            className="text-xs"
          >
            Ano todo
          </Button>
        </div>
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
                    {p.due_date && (
                      <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-xs text-muted-foreground">
                         {(() => {
                           const d = new Date(p.due_date + 'T12:00:00');
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
              <Button
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => setDeleteMode('this')}
              >
                <span className="font-medium">Apenas este mês</span>
                <span className="block text-xs text-muted-foreground">Remove só a próxima parcela</span>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => setDeleteMode('forward')}
              >
                <span className="font-medium">Daqui em diante</span>
                <span className="block text-xs text-muted-foreground">Mantém passadas, remove futuras</span>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-left text-red-500"
                onClick={() => setDeleteMode('all')}
              >
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
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={deletePayablesMutation.isPending}
              >
                Remover
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}