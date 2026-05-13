import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Edit2, Undo2, Repeat, Layers, Receipt, RefreshCw, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { format, isPast, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ExpenseFormModal from '@/components/payables/ExpenseFormModal';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditPayableModal from '@/components/payables/EditPayableModal';
import RecurrenceFormModal from '@/components/recurrences/RecurrenceFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABELS = { pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', scheduled: 'Agendado' };
const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  scheduled: 'bg-blue-100 text-blue-700',
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

// ---- Página principal ----
export default function Payables() {
  const [activeTab, setActiveTab] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [confirmingPayable, setConfirmingPayable] = useState(null);
  const [editingPayable, setEditingPayable] = useState(null);
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [deleteMode, setDeleteMode] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open'); // 'open', 'overdue', 'paid'
  const [filterBy, setFilterBy] = useState('competencia'); 
  const queryClient = useQueryClient();

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const getStatus = (p) => {
    if (p.status === 'paid') return 'paid';
    if (p.status === 'scheduled') return 'scheduled';
    if (p.due_date && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date))) return 'overdue';
    return p.status || 'pending';
  };

  const paidDateMap = {};
  transactions.forEach(t => { if (t.payable_id) paidDateMap[t.payable_id] = t.date; });

  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);

  const filtered = payables.filter(p => {
    // 1. ESCONDER ITENS INDIVIDUAIS DE CARTÃO (Eles ficam na tela de Faturas)
    // Só mostramos se for a Fatura Consolidada (is_card_invoice_payable)
    if (p.origin_type === 'card' && !p.is_card_invoice_payable) return false;

    // 2. FILTRO POR ABA
    if (activeTab === 'fixas' && !(p.recurrence_id || p.recurrent)) return false;
    if (activeTab === 'parceladas' && !p.installment_group_id) return false;
    if (activeTab === 'avulsas' && (p.recurrence_id || p.recurrent || p.installment_group_id)) return false;

    const status = getStatus(p);

    // 3. FILTRO POR STATUS (Removido o 'provisioned/cartão')
    if (filterStatus === 'open' && status === 'paid') return false;
    if (filterStatus === 'overdue' && status !== 'overdue') return false;
    if (filterStatus === 'paid' && status !== 'paid') return false;

    // 4. FILTRO DE DATA
    if (status === 'paid') {
      const payDate = paidDateMap[p.id] || p.due_date;
      if (!payDate) return false;
      const d = new Date(payDate.includes('T') ? payDate : payDate + 'T12:00:00');
      return d >= mStart && d <= mEnd;
    }

    const dateField = filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date;
    if (!dateField) return false;
    const d = new Date(dateField.includes('T') ? dateField : dateField + 'T12:00:00');
    return !isNaN(d.getTime()) && d >= mStart && d <= mEnd;
  });

  const totalFiltered = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const undoPaymentMutation = useMutation({
    mutationFn: async (p) => {
      if (p.transaction_id) await base44.entities.Transaction.delete(p.transaction_id);
      await base44.entities.Payable.update(p.id, { status: 'pending', transaction_id: null });
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Pagamento desfeito!'); },
  });

  return (
    <div className="p-6 space-y-6 font-sora text-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar</h1>
          <p className="text-muted-foreground text-sm font-bold uppercase tracking-tighter mt-1">
            {filterStatus === 'open' ? `Pendentes · ${fmt(totalFiltered)}` :
             filterStatus === 'overdue' ? `Vencidas · ${fmt(totalFiltered)}` :
             `Pagas · ${fmt(totalFiltered)}`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-primary font-bold">
          <Plus className="w-4 h-4 mr-2" /> NOVA DESPESA
        </Button>
      </div>

      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {['todas', 'fixas', 'parceladas', 'avulsas'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === tab ? 'bg-white shadow text-primary' : 'text-muted-foreground'}`}>{tab}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['open', 'overdue', 'paid'].map(s => (
          <Button key={s} variant={filterStatus === s ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus(s)} className="text-[10px] font-black uppercase h-7">
            {s === 'open' ? 'Em Aberto' : s === 'overdue' ? 'Vencidas' : 'Pagas'}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-bold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-1 bg-white border p-1 rounded-lg">
          <Button variant={filterBy === 'due_date' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilterBy('due_date')} className="text-[9px] font-black h-6 px-2">VENCIMENTO</Button>
          <Button variant={filterBy === 'competencia' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilterBy('competencia')} className="text-[9px] font-black h-6 px-2">COMPETÊNCIA</Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.length === 0 && <p className="p-12 text-center text-sm text-slate-400 font-bold uppercase tracking-widest">Nada para pagar este mês</p>}
            {filtered.map(p => {
              const status = getStatus(p);
              const TypeIcon = p.recurrence_id || p.recurrent ? Repeat : p.installment_group_id ? Layers : null;
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-bold">
                      <p className="text-sm truncate text-slate-700 uppercase tracking-tight">{p.description}</p>
                      {p.is_card_invoice_payable && <Badge className="bg-primary/10 text-primary border-none text-[9px] px-1.5 font-black uppercase">Fatura</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] font-bold text-slate-400 uppercase">
                        {format(new Date((filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date).includes('T') ? (filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date) : (filterBy === 'competencia' ? (p.competencia || p.due_date) : p.due_date) + 'T12:00:00'), 'dd MMM yyyy', { locale: ptBR })}
                        {p.category && <Badge variant="outline" className="text-[9px] py-0 h-4 border-slate-200 font-black tracking-tighter ml-2">{CATEGORY_LABELS[p.category] || p.category}</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-2">
                    <p className="text-sm font-black text-red-600">-{fmt(p.amount)}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 border-l pl-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setEditingPayable(p)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    {status !== 'paid' ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => setConfirmingPayable(p)}><CheckCircle2 className="w-4 h-4" /></Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500" onClick={() => undoPaymentMutation.mutate(p)}><Undo2 className="w-4 h-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300" onClick={() => setDeletingPayable(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Modais omitidos para brevidade, mas devem ser mantidos conforme o seu arquivo original */}
      {showForm && <ExpenseFormModal onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }} />}
      {confirmingPayable && <ConfirmPayableModal payable={confirmingPayable} onClose={() => { setConfirmingPayable(null); queryClient.invalidateQueries(); }} />}
      {editingPayable && <EditPayableModal payable={editingPayable} onClose={() => setEditingPayable(null)} onSaved={() => { setEditingPayable(null); queryClient.invalidateQueries(); }} />}
    </div>
  );
}