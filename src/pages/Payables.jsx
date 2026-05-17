import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Edit2, Undo2, Repeat, Layers, Receipt, RefreshCw, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { format, isPast, isToday, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogAction } from '@/components/ui/alert-dialog';
import ExpenseFormModal from '@/components/payables/ExpenseFormModal';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditPayableModal from '@/components/payables/EditPayableModal';
import RecurrenceFormModal from '@/components/recurrences/RecurrenceFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABELS = { pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', provisioned: 'Provisionado' };
const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  provisioned: 'bg-blue-100 text-blue-700',
};
const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros', transferencia_liquidacao: 'Liquidação Fatura'
};
const CATEGORY_COLORS = {
  moradia: 'bg-blue-100 text-blue-700', alimentacao: 'bg-orange-100 text-orange-700',
  transferencia_liquidacao: 'bg-slate-200 text-slate-700', outros: 'bg-slate-100 text-slate-700',
};

// ---- Aba de Recorrências ----
function RecurrencesTab() {
  const [showForm, setShowForm] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState(null);
  const [deletingRecurrence, setDeletingRecurrence] = useState(null);
  const [regeneratingRecurrence, setRegeneratingRecurrence] = useState(null);
  const queryClient = useQueryClient();

  const { data: recurrences = [], isLoading } = useQuery({
    queryKey: ['recurrences'],
    queryFn: () => base44.entities.Recurrence.list('-created_date', 100),
  });

  const deleteMutation = useMutation({
    mutationFn: async (recurrence) => {
      const payables = await base44.entities.Payable.list('-due_date', 500);
      const toDelete = payables.filter(p => p.recurrence_id === recurrence.id || p.description === recurrence.description);
      for (const p of toDelete) await base44.entities.Payable.delete(p.id);
      await base44.entities.Recurrence.delete(recurrence.id);
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Recorrência removida'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Recurrence.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries(['recurrences']),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-bold uppercase">{recurrences.filter(r => r.active !== false).length} ativas</p>
        <Button size="sm" onClick={() => setShowForm(true)} className="font-bold">
          <Plus className="w-4 h-4 mr-1" /> Nova Fixa
        </Button>
      </div>
      <Card className="border-0 shadow-sm font-sora">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>}
            {!isLoading && recurrences.filter(r => r.active !== false).map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="w-1.5 h-10 rounded-full flex-shrink-0 bg-primary/40" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate uppercase">{r.description}</p>
                  <span className="text-xs text-muted-foreground font-bold">DIA {r.due_day}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-500">-{fmt(r.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Página principal ----
export default function Payables() {
  const [activeTab, setActiveTab] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [confirmingPayable, setConfirmingPayable] = useState(null);
  const [editingPayable, setEditingPayable] = useState(null);
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open'); 
  const [filterBy, setFilterBy] = useState('competencia'); 
  const queryClient = useQueryClient();

  const listFilter = activeTab === 'fixas' ? 'FIXAS' : activeTab === 'parceladas' ? 'PARCELADAS' : activeTab === 'avulsas' ? 'AVULSAS' : 'TODAS';
  const listStatus = filterStatus === 'open' ? 'EM_ABERTO' : filterStatus === 'overdue' ? 'VENCIDAS' : 'PAGAS';
  const monthKey = format(currentMonth, 'yyyy-MM');

  const { data: payablesResponse } = useQuery({
    queryKey: ['payables-list', monthKey, listFilter, listStatus, filterBy],
    queryFn: () => base44.functions.invoke('listPayables', {
      month: monthKey,
      filter: listFilter,
      status: listStatus,
      sort: filterBy,
    }),
  });

  const filtered = payablesResponse?.data?.items || [];

  const getStatus = (p) => {
    if (p.status === 'paid') return 'paid';
    if (p.due_date && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date))) return 'overdue';
    return p.status || 'pending';
  };

  const totalFiltered = filtered.reduce((s, p) => s + (p.amount || 0), 0);

  // MUTAÇÃO: Estornar Pagamento
  const undoPaymentMutation = useMutation({
    mutationFn: async (p) => {
      if (p.transaction_id) await base44.entities.Transaction.delete(p.transaction_id);
      return await base44.entities.Payable.update(p.id, { status: 'pending', transaction_id: null });
    },
    onSuccess: () => { 
      queryClient.invalidateQueries(); 
      toast.success('Pagamento desfeito! A fatura foi reaberta.'); 
    },
  });

  // MUTAÇÃO: Deletar Payable
  const deletePayableMutation = useMutation({
    mutationFn: async (p) => {
      return await base44.entities.Payable.delete(p.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setDeletingPayable(null);
      toast.success('Lançamento excluído.');
    },
  });

  return (
    <div className="p-6 space-y-6 font-sora text-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contas a Pagar</h1>
          <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">
            {filterStatus === 'open' ? `Pendentes · ${fmt(totalFiltered)}` :
             filterStatus === 'overdue' ? `Vencidas · ${fmt(totalFiltered)}` :
             `Pagas · ${fmt(totalFiltered)}`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-primary font-bold h-10 px-6">
          <Plus className="w-4 h-4 mr-2" /> NOVA DESPESA
        </Button>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {['todas', 'fixas', 'parceladas', 'avulsas'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === tab ? 'bg-white shadow text-primary' : 'text-slate-500'}`}>{tab}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['open', 'overdue', 'paid'].map(s => (
          <Button key={s} variant={filterStatus === s ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus(s)} className="text-[10px] font-black uppercase h-7 tracking-tighter">
            {s === 'open' ? 'Em Aberto' : s === 'overdue' ? 'Vencidas' : 'Pagas'}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-5 h-5" /></Button>
          <span className="text-sm font-bold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-5 h-5" /></Button>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl">
          <Button variant={filterBy === 'due_date' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilterBy('due_date')} className="text-[9px] font-black h-6 px-3">VENCIMENTO</Button>
          <Button variant={filterBy === 'competencia' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilterBy('competencia')} className="text-[9px] font-black h-6 px-3">COMPETÊNCIA</Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {filtered.length === 0 && <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum lançamento encontrado</p>}
            {filtered.map(p => {
              const status = getStatus(p);
              const TypeIcon = p.recurrence_id || p.recurrent ? Repeat : p.installment_group_id ? Layers : null;
              return (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${p.is_projection ? 'bg-slate-50/60 opacity-60' : 'hover:bg-slate-50/50'}`}>
                  <div className={`w-1.5 h-11 rounded-full flex-shrink-0 ${status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-bold mb-0.5">
                      <p className="text-sm truncate text-slate-800 uppercase tracking-tight">{p.description}</p>
                      {p.is_projection && <Badge className="bg-slate-100 text-slate-500 border-none text-[9px] px-2 font-black uppercase">Projeção</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {format(new Date((filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date).includes('T') ? (filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date) : (filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date) + 'T12:00:00'), 'dd MMM yyyy', { locale: ptBR })}
                        {p.category && <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-slate-300" /> {CATEGORY_LABELS[p.category] || p.category}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-4">
                    <p className="text-sm font-black text-slate-900">-{fmt(p.amount)}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!p.is_projection && (
                      <>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-primary" onClick={() => setEditingPayable(p)}><Edit2 className="w-4 h-4" /></Button>
                        {status !== 'paid' ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50" onClick={() => setConfirmingPayable(p)}><CheckCircle2 className="w-5 h-5" /></Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-amber-500 hover:bg-amber-50" onClick={() => undoPaymentMutation.mutate(p)} disabled={undoPaymentMutation.isPending}><Undo2 className={`w-5 h-5 ${undoPaymentMutation.isPending ? 'animate-spin' : ''}`} /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-red-500" onClick={() => setDeletingPayable(p)}><Trash2 className="w-4 h-4" /></Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* MODAL: Confirmação de Deleção */}
      <AlertDialog open={!!deletingPayable} onOpenChange={() => setDeletingPayable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 mt-4">
            <AlertDialogCancel className="flex-1 font-bold">CANCELAR</AlertDialogCancel>
            <Button variant="destructive" className="flex-1 font-bold" onClick={() => deletePayableMutation.mutate(deletingPayable)} disabled={deletePayableMutation.isPending}>
              {deletePayableMutation.isPending ? 'EXCLUINDO...' : 'EXCLUIR AGORA'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {showForm && <ExpenseFormModal onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }} />}
      {confirmingPayable && <ConfirmPayableModal payable={confirmingPayable} onClose={() => { setConfirmingPayable(null); queryClient.invalidateQueries(); }} />}
      {editingPayable && <EditPayableModal payable={editingPayable} onClose={() => setEditingPayable(null)} onSaved={() => { setEditingPayable(null); queryClient.invalidateQueries(); }} />}
    </div>
  );
}