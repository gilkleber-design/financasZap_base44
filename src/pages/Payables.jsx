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
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros',
};
const CATEGORY_COLORS = {
  moradia: 'bg-blue-100 text-blue-700', servicos: 'bg-purple-100 text-purple-700',
  alimentacao: 'bg-orange-100 text-orange-700', saude: 'bg-red-100 text-red-700',
  educacao: 'bg-green-100 text-green-700', transporte: 'bg-yellow-100 text-yellow-700',
  lazer: 'bg-pink-100 text-pink-700', impostos: 'bg-gray-100 text-gray-700',
  outros: 'bg-slate-100 text-slate-700',
};

// Gera 13 Payables futuros para uma recorrência
async function generateRecurrencePayables(recurrence, recurrenceId) {
  const { addMonths: addM, startOfMonth: soM } = await import('date-fns');
  const now = new Date();
  const payables = [];
  for (let i = 0; i < 13; i++) {
    const targetMonth = addM(soM(now), i);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(recurrence.due_day, maxDay);
    const dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    payables.push({
      description: recurrence.description,
      amount: recurrence.amount,
      due_date: dueDate + 'T12:00:00',
      competencia: dueDate,
      category: recurrence.category,
      status: 'pending',
      recurrent: true,
      recurrence_id: recurrenceId,
      origin_id: recurrence.origin_id || undefined,
      origin_type: recurrence.origin_type || undefined,
      payment_modality: recurrence.payment_modality || 'manual',
    });
  }
  await base44.entities.Payable.bulkCreate(payables);
}

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

  const regenerateMutation = useMutation({
    mutationFn: async (recurrence) => {
      await generateRecurrencePayables(recurrence, recurrence.id);
    },
    onSuccess: () => { queryClient.invalidateQueries(['payables']); toast.success('13 meses gerados!'); setRegeneratingRecurrence(null); },
  });

  const handleCreated = async (recurrence) => {
    setShowForm(false);
    setEditingRecurrence(null);
    queryClient.invalidateQueries(['recurrences']);
    await generateRecurrencePayables(recurrence, recurrence.id);
    queryClient.invalidateQueries(['payables']);
    toast.success('Recorrência criada! 13 meses gerados.');
  };

  const active = recurrences.filter(r => r.active !== false);
  const inactive = recurrences.filter(r => r.active === false);
  const totalMonthly = active.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{active.length} ativas · {fmt(totalMonthly)}/mês</p>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nova Fixa
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>}
            {!isLoading && active.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma despesa fixa. Use "Nova Despesa" e escolha o tipo "Fixa".</p>
            )}
            {active.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="w-2 h-10 rounded-full flex-shrink-0 bg-primary/40" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">Todo dia {r.due_day}</span>
                    {r.category && (
                      <Badge className={`text-xs py-0 h-4 px-1.5 border-0 ${CATEGORY_COLORS[r.category] || CATEGORY_COLORS.outros}`}>
                        {CATEGORY_LABELS[r.category] || r.category}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-500" onClick={() => setEditingRecurrence(r)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-blue-500" onClick={() => setRegeneratingRecurrence(r)}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-amber-500" onClick={() => toggleMutation.mutate({ id: r.id, active: false })}>
                    <ToggleRight className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => setDeletingRecurrence(r)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="text-right min-w-[80px]">
                  <p className="text-sm font-semibold text-red-500">-{fmt(r.amount)}</p>
                  <span className="text-xs text-muted-foreground">mensal</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {inactive.length > 0 && (
        <Card className="border-0 shadow-sm opacity-60">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {inactive.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-2 h-10 rounded-full flex-shrink-0 bg-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground line-through">{r.description}</p>
                    <span className="text-xs text-muted-foreground">Todo dia {r.due_day}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => toggleMutation.mutate({ id: r.id, active: true })}>
                    <ToggleLeft className="w-4 h-4" />
                  </Button>
                  <p className="text-sm text-muted-foreground min-w-[80px] text-right">{fmt(r.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(showForm || editingRecurrence) && (
        <RecurrenceFormModal
          initial={editingRecurrence}
          onClose={() => { setShowForm(false); setEditingRecurrence(null); }}
          onSaved={handleCreated}
        />
      )}

      {regeneratingRecurrence && (
        <AlertDialog open onOpenChange={() => setRegeneratingRecurrence(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regerar parcelas?</AlertDialogTitle>
              <AlertDialogDescription>Gera 13 novos lançamentos futuros para "{regeneratingRecurrence.description}". Parcelas já existentes não serão removidas.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button className="flex-1" onClick={() => regenerateMutation.mutate(regeneratingRecurrence)} disabled={regenerateMutation.isPending}>
                {regenerateMutation.isPending ? 'Gerando...' : 'Gerar'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deletingRecurrence && (
        <AlertDialog open onOpenChange={() => setDeletingRecurrence(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover recorrência?</AlertDialogTitle>
              <AlertDialogDescription>Deleta "{deletingRecurrence.description}" e todos os lançamentos vinculados.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutateAsync(deletingRecurrence).then(() => setDeletingRecurrence(null))} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
  const [deleteMode, setDeleteMode] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterBy, setFilterBy] = useState('due_date');
  const queryClient = useQueryClient();

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const deletePayablesMutation = useMutation({
    mutationFn: async ({ payable, mode }) => {
      const allPayables = await base44.entities.Payable.list('-due_date', 500);
      if (mode === 'this') {
        await base44.entities.Payable.delete(payable.id);
      } else if (mode === 'all') {
        const toDelete = allPayables.filter(p => p.description === payable.description);
        for (const p of toDelete) await base44.entities.Payable.delete(p.id);
      } else if (mode === 'forward') {
        const now = new Date();
        const toDelete = allPayables.filter(p => p.description === payable.description && new Date(p.due_date) >= now);
        for (const p of toDelete) await base44.entities.Payable.delete(p.id);
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

  // Filtra por tipo (aba)
  const byTab = (p) => {
    if (activeTab === 'fixas') return p.recurrence_id || p.recurrent;
    if (activeTab === 'parceladas') return !!p.installment_group_id;
    if (activeTab === 'avulsas') return !p.recurrence_id && !p.recurrent && !p.installment_group_id;
    return true;
  };

  const filtered = payables.filter(p => {
    if (!byTab(p)) return false;
    const status = getStatus(p);
    if (filterStatus === 'open' && status === 'paid') return false;
    if (filterStatus === 'overdue' && status !== 'overdue') return false;
    if (filterStatus === 'paid' && status !== 'paid') return false;

    if (filterStatus === 'paid' || status === 'paid') {
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
  const pendingCount = filtered.filter(p => getStatus(p) === 'pending').length;
  const overdueCount = filtered.filter(p => getStatus(p) === 'overdue').length;

  const TABS = [
    { value: 'todas', label: 'Todas', icon: null },
    { value: 'fixas', label: 'Fixas', icon: Repeat },
    { value: 'parceladas', label: 'Parceladas', icon: Layers },
    { value: 'avulsas', label: 'Avulsas', icon: Receipt },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Contas a Pagar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filterStatus === 'open' ? `${pendingCount} pendentes · ${overdueCount} vencidas · ${fmt(totalFiltered)}` :
             filterStatus === 'overdue' ? `${filtered.length} vencidas · ${fmt(totalFiltered)}` :
             `${filtered.length} pagas · ${fmt(totalFiltered)}`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Despesa
        </Button>
      </div>

      {/* Abas de tipo */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === value ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {/* Aba Fixas: mostra RecurrencesTab */}
      {activeTab === 'fixas' ? (
        <RecurrencesTab />
      ) : (
        <>
          {/* Filtros de status */}
          <div className="flex items-center gap-2 flex-wrap">
            {['open', 'overdue', 'paid'].map(s => (
              <Button key={s} variant={filterStatus === s ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterStatus(s)} className="text-xs">
                {s === 'open' ? 'Em Aberto' : s === 'overdue' ? 'Vencidas' : 'Pagas'}
              </Button>
            ))}
          </div>

          {/* Navegação de mês */}
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
                {['due_date', 'competencia'].map(fb => (
                  <Button key={fb} variant={filterBy === fb ? 'secondary' : 'outline'} size="sm" onClick={() => setFilterBy(fb)} className="text-xs">
                    {fb === 'due_date' ? 'Vencimento' : 'Competência'}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada</p>}
                {filtered.map(p => {
                  const status = getStatus(p);
                  const typeIcon = p.recurrence_id || p.recurrent ? Repeat : p.installment_group_id ? Layers : null;
                  const TypeIcon = typeIcon;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <div className={`w-2 h-10 rounded-full flex-shrink-0 ${status === 'paid' ? 'bg-emerald-400' : status === 'overdue' ? 'bg-red-400' : status === 'scheduled' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{p.description}</p>
                          {TypeIcon && <TypeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.due_date && (
                            <span className="text-xs text-muted-foreground">
                              Venc: {format(new Date(p.due_date.includes('T') ? p.due_date : p.due_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          )}
                          {p.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{CATEGORY_LABELS[p.category] || p.category}</Badge>}
                          {p.installment_group_id && p.installment_number && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{p.installment_number}/{p.installment_count}</Badge>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-red-500">-{fmt(p.amount)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-500" onClick={() => setEditingPayable(p)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      {status !== 'paid' && (
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500" onClick={() => setConfirmingPayable(p)}>
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                      {status === 'paid' && (
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-amber-500" onClick={() => undoPaymentMutation.mutate(p)}>
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
        </>
      )}

      {showForm && <ExpenseFormModal onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }} />}
      {confirmingPayable && <ConfirmPayableModal payable={confirmingPayable} onClose={() => { setConfirmingPayable(null); queryClient.invalidateQueries(); }} />}
      {editingPayable && <EditPayableModal payable={editingPayable} onClose={() => setEditingPayable(null)} onSaved={() => { setEditingPayable(null); queryClient.invalidateQueries(); }} />}

      {deletingPayable && !deleteMode && (
        <AlertDialog open onOpenChange={() => setDeletingPayable(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir "{deletingPayable.description}"?</AlertDialogTitle>
              <AlertDialogDescription>Escolha como deseja proceder:</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => setDeleteMode('this')}>
                <div><p className="font-medium">Apenas este lançamento</p><p className="text-xs text-muted-foreground">Remove somente este</p></div>
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDeleteMode('forward')}>
                <div><p className="font-medium">Daqui em diante</p><p className="text-xs text-muted-foreground">Mantém passados, remove futuros</p></div>
              </Button>
              <Button variant="outline" className="w-full justify-start text-red-500" onClick={() => setDeleteMode('all')}>
                <div><p className="font-medium">Todos com mesmo nome</p><p className="text-xs text-muted-foreground">Deleta todos os lançamentos</p></div>
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
                {deleteMode === 'this' && `Remove apenas "${deletingPayable.description}"`}
                {deleteMode === 'forward' && `Remove este e todos os futuros de "${deletingPayable.description}"`}
                {deleteMode === 'all' && `Remove TODOS os lançamentos de "${deletingPayable.description}"`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button variant="destructive" className="flex-1" onClick={() => deletePayablesMutation.mutateAsync({ payable: deletingPayable, mode: deleteMode }).then(() => { setDeletingPayable(null); setDeleteMode(null); })} disabled={deletePayablesMutation.isPending}>
                {deletePayablesMutation.isPending ? 'Removendo...' : 'Remover'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}