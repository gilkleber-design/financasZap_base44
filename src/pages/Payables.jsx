import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Edit2,
  Settings,
  ToggleLeft,
  ToggleRight,
  Bell,
} from 'lucide-react';
import { format, addMonths, subMonths, isSameDay, addDays, endOfWeek, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ExpenseFormModal from '@/components/payables/ExpenseFormModal';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditPayableModal from '@/components/payables/EditPayableModal';
import RecurrenceFormModal from '@/components/recurrences/RecurrenceFormModal';
import PayablesOverview, { PAYABLE_SECTION_ICONS } from '@/components/payables/PayablesOverview';
import DashboardLogo from '@/components/dashboard/DashboardLogo';
import { getInitials } from '@/components/dashboard/financaszapTheme';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v || 0);

function ManageAccountsTab({ currentMonth, setCurrentMonth, onEditRecurrence, onEditPayable, onDeletePayable, payablesItems, loadingPayables }) {
  const [showForm, setShowForm] = useState(false);
  const [deletingRecurrence, setDeletingRecurrence] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMatrizesOpen, setIsMatrizesOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: recurrences = [], isLoading: loadingRecurrences } = useQuery({
    queryKey: ['recurrences'],
    queryFn: () => base44.entities.Recurrence.list('-created_date', 100),
  });

  const isLoading = loadingRecurrences || loadingPayables;

  const monthPayables = (payablesItems || []).filter(p => {
    const due = p.due_date || p.competencia;
    if (!due) return false;
    const normalized = String(due).includes('T') ? String(due) : `${due}T12:00:00`;
    const parsed = new Date(normalized);
    if (isNaN(parsed.getTime())) return false;
    const isOverdueAndPending = p.status === 'pending' && parsed < new Date(new Date().setHours(0,0,0,0));
    return isSameMonth(parsed, currentMonth) || isOverdueAndPending;
  });

  const filteredPayables = monthPayables.filter(p =>
    !searchTerm || p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fixas = filteredPayables.filter(p => p.recurrence_id && p.origin_type !== 'card');
  const parceladas = filteredPayables.filter(p => !p.recurrence_id && (p.installment_count > 1 || p.installment_group_id) && p.origin_type !== 'card');
  const avulsas = filteredPayables.filter(p => !p.recurrence_id && !(p.installment_count > 1 || p.installment_group_id) && p.origin_type !== 'card');
  const noCartao = filteredPayables.filter(p => p.origin_type === 'card');

  const deleteMutation = useMutation({
    mutationFn: async (recurrence) => {
      const payables = await base44.entities.Payable.list('-due_date', 500);
      const linkedPayables = payables.filter(
        (p) => p.recurrence_id === recurrence.id
      );
      for (const p of linkedPayables) {
        if (p.status !== 'paid') {
          await base44.entities.Payable.delete(p.id);
        } else {
          await base44.entities.Payable.update(p.id, {
            recurrence_id: null,
          });
        }
      }
      await base44.entities.Recurrence.delete(recurrence.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      setDeletingRecurrence(null);
      toast.success('Conta fixa excluída permanentemente.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) =>
      base44.entities.Recurrence.update(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      toast.success('Status da conta fixa atualizado.');
    },
  });

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between rounded-[14px] border border-border bg-card p-3 shadow-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm font-bold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {recurrences.length > 0 && !searchTerm && (
        <div className="mb-6">
          <button
            onClick={() => setIsMatrizesOpen(!isMatrizesOpen)}
            className="flex items-center gap-2 w-full text-left focus:outline-none mb-3 pl-2 group"
          >
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-700 transition-colors">Matrizes (Contas Fixas Base)</h2>
            {isMatrizesOpen ? <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />}
          </button>
          {isMatrizesOpen && (
            <Card className="border-0 shadow-sm font-sora bg-white animate-in slide-in-from-top-2 duration-200">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {isLoading && (
                    <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Carregando fixas...
                    </p>
                  )}
                  {!isLoading && recurrences.length === 0 && (
                    <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Nenhuma conta fixa cadastrada
                    </p>
                  )}
                  {!isLoading &&
                    recurrences.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                          r.active === false
                            ? 'opacity-40 bg-slate-50/50'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <div
                          className={`w-1.5 h-11 rounded-full flex-shrink-0 ${
                            r.active === false ? 'bg-slate-300' : 'bg-blue-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                            {r.description}
                          </p>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                            VENCE TODO DIA {r.due_day}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 mr-4">
                          <p className="text-sm font-black text-slate-900">
                            {fmt(r.amount)}
                          </p>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              r.active === false
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {r.active === false ? 'INATIVA' : 'CONTA ATIVA'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-slate-400 hover:text-primary"
                            onClick={() => onEditRecurrence(r)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-slate-400 hover:text-primary"
                            onClick={() =>
                              toggleMutation.mutate({
                                id: r.id,
                                active: r.active === false,
                              })
                            }
                          >
                            {r.active === false ? (
                              <ToggleLeft className="w-5 h-5 text-slate-400" />
                            ) : (
                              <ToggleRight className="w-5 h-5 text-primary" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-slate-300 hover:text-red-500"
                            onClick={() => setDeletingRecurrence(r)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm mb-6 mt-4">
        <div className="flex items-center gap-2 flex-1">
          <p className="text-sm text-slate-500 font-bold uppercase ml-2 whitespace-nowrap">
            {filteredPayables.length} Contas
          </p>
          <input
            type="text"
            placeholder="Buscar contas..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 h-9 rounded-md border border-slate-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(true)}
          className="font-bold bg-primary whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-1" /> NOVA CONTA
        </Button>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 pl-2 pr-2">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Contas Lançadas do Mês</h2>
          <span className="text-sm font-black text-slate-700">{fmt(filteredPayables.reduce((acc, p) => acc + Number(p.amount || 0), 0))}</span>
        </div>
        <Card className="border-0 shadow-sm font-sora bg-white">
          <CardContent className="p-0">
            <div className="pb-4">
              {isLoading && (
                <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Carregando contas...
                </p>
              )}
              {!isLoading && filteredPayables.length === 0 && (
                <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Nenhuma conta encontrada
                </p>
              )}
              {!isLoading && filteredPayables.length > 0 && (
                <>
                  {[
                    { title: 'Fixas', items: fixas },
                    { title: 'Parceladas', items: parceladas },
                    { title: 'Avulsas', items: avulsas },
                    { title: 'No Cartão', items: noCartao }
                  ].map(group => {
                    if (group.items.length === 0) return null;
                    return (
                      <div key={group.title} className="mb-2">
                        <div className="flex items-center justify-between px-5 py-2 bg-slate-50/80 border-y border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          <span>{group.title} ({group.items.length})</span>
                          <span>{fmt(group.items.reduce((acc, p) => acc + Number(p.amount || 0), 0))}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {group.items.map(p => {
                            const isPaid = p.status === 'paid' || p.status === 'provisioned';
                            return (
                              <div
                                key={p.id}
                                className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                                  isPaid
                                    ? 'opacity-40 bg-slate-50/50'
                                    : 'hover:bg-slate-50/50'
                                }`}
                              >
                                <div
                                  className={`w-1.5 h-11 rounded-full flex-shrink-0 ${
                                    isPaid ? 'bg-slate-300' : 'bg-amber-400'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                    {p.description}
                                    {p.installment_count > 1 && (
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                        {p.installment_number}/{p.installment_count}
                                      </span>
                                    )}
                                  </p>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                    VENCIMENTO: {format(new Date(String(p.due_date).includes('T') ? p.due_date : `${p.due_date}T12:00:00`), 'dd/MM/yyyy')}
                                  </span>
                                </div>
                                <div className="text-right flex-shrink-0 mr-4">
                                  <p className="text-sm font-black text-slate-900">
                                    {fmt(p.amount)}
                                  </p>
                                  <span
                                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                      p.status === 'paid' ? 'bg-[#E6F9F0] border border-[#0A9E6A] text-[#0A6E50]'
                                      : p.status === 'provisioned' ? 'bg-[#EEF2FF] border border-[#7C93FF] text-[#4254C5]'
                                      : (new Date(p.due_date || p.competencia) < new Date(new Date().setHours(0,0,0,0))) ? 'bg-[#FFECEC] border border-[#E74C3C] text-[#C0392B]'
                                      : 'bg-[#E0F5F5] border border-[#0FA3A3] text-[#0A7070]'
                                    }`}
                                  >
                                    {p.status === 'paid' ? 'PAGO' : p.status === 'provisioned' ? 'NO CARTÃO' : (new Date(p.due_date || p.competencia) < new Date(new Date().setHours(0,0,0,0))) ? 'VENCIDO' : 'PENDENTE'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-slate-400 hover:text-primary"
                                    onClick={() => onEditPayable(p)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-slate-300 hover:text-red-500"
                                    onClick={() => onDeletePayable(p)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!deletingRecurrence}
        onOpenChange={() => setDeletingRecurrence(null)}
      >
        <AlertDialogContent className="font-sora">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta Conta Fixa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta será permanentemente removida da tabela de recorrências.
              Transações pendentes serão apagadas, mas transações já pagas no
              passado serão mantidas intactas no seu histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 mt-4">
            <AlertDialogCancel className="flex-1 font-bold">
              CANCELAR
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="flex-1 font-bold"
              onClick={() => deleteMutation.mutate(deletingRecurrence)}
              disabled={deleteMutation.isPending}
            >
              EXCLUIR DEFINITIVO
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {showForm && (
        <RecurrenceFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            queryClient.invalidateQueries();
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

export default function Payables() {
  const [viewMode, setViewMode] = useState('mensal');
  const [showForm, setShowForm] = useState(false);
  const [confirmingPayable, setConfirmingPayable] = useState(null);
  const [editingPayable, setEditingPayable] = useState(null);
  const [editingRecurrence, setEditingRecurrence] = useState(null);
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [paidSectionOpen, setPaidSectionOpen] = useState(false);
  const queryClient = useQueryClient();

  const monthKey = format(currentMonth, 'yyyy-MM');

  const { data: payablesResponse, isLoading: loadingPayables } = useQuery({
    queryKey: ['payables-list', monthKey],
    queryFn: () =>
      base44.functions.invoke('listPayables', {
        month: monthKey,
        status: 'TODAS',
      }),
  });

  const payablesItems = payablesResponse?.data?.items || [];

  const todayStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0), []);

  const parseItemDate = (value) => {
    if (!value) return null;
    const normalized = String(value).includes('T') ? String(value) : `${value}T12:00:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const validPayables = useMemo(() => {
    return payablesItems.filter(p => p.category !== 'transferencia_liquidacao' && p.category !== 'reembolso');
  }, [payablesItems]);

  const reembolsoPayables = useMemo(() => {
    return payablesItems.filter(p => p.category === 'reembolso');
  }, [payablesItems]);

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  // INVARIANTE: Previsto = Pago + Vencido + A Vencer
  // Vencido e A Vencer usam "não-pago" em vez de "pending" para capturar
  // qualquer status fora do padrão (overdue, null, etc.) e fechar a conta.
  const kpis = useMemo(() => {
    const currentMonthKey = format(currentMonth, 'yyyy-MM');
    const hojeStr = format(new Date(), 'yyyy-MM-dd');

    // Previsto: todos os itens com due_date no mês, independente de status
    const previsto = validPayables
      .filter(p => String(p.due_date || p.competencia || '').slice(0, 7) === currentMonthKey)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Pago: paid ou provisioned no mês (sem restrição de data dentro do mês)
    const pago = validPayables
      .filter(p => {
        const d = String(p.due_date || p.competencia || '');
        return (p.status === 'paid' || p.status === 'provisioned') &&
               d.slice(0, 7) === currentMonthKey;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Vencido: qualquer status não-pago, mês atual, due_date já passou
    const vencido = validPayables
      .filter(p => {
        const d = String(p.due_date || p.competencia || '');
        return p.status !== 'paid' && p.status !== 'provisioned' &&
               d.slice(0, 7) === currentMonthKey &&
               d.slice(0, 10) < hojeStr;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // A Vencer: qualquer status não-pago, mês atual, due_date >= hoje
    const aVencer = validPayables
      .filter(p => {
        const d = String(p.due_date || p.competencia || '');
        return p.status !== 'paid' && p.status !== 'provisioned' &&
               d.slice(0, 7) === currentMonthKey &&
               d.slice(0, 10) >= hojeStr;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const pct = previsto > 0 ? ((pago / previsto) * 100).toFixed(1) : '0.0';

    return {
      expected: previsto,
      expectedLabel: "total do mês",
      paid: pago,
      paidLabel: `${pct}% do previsto`,
      overdue: vencido,
      overdueLabel: "ação urgente",
      open: aVencer,
      openLabel: "aguardando prazo",
    };
  }, [validPayables, currentMonth]);

  // Contas de meses anteriores ainda não pagas (banner de alerta)
  const atrasadasMesesAnteriores = useMemo(() => {
    const currentMonthKey = format(currentMonth, 'yyyy-MM');
    return validPayables.filter(p => {
      const d = String(p.due_date || p.competencia || '');
      return p.status !== 'paid' && p.status !== 'provisioned' &&
             d.length >= 7 && d.slice(0, 7) < currentMonthKey;
    });
  }, [validPayables, currentMonth]);

  const totalAtrasadasAnteriores = atrasadasMesesAnteriores.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if (viewMode === 'mensal') {
    localStorage.setItem('contas_mes', format(currentMonth, 'yyyy-MM'));
  }

  const urgencySections = useMemo(() => {
    const today = new Date();
    const tomorrow = addDays(todayStart, 1);
    const weekEnd = endOfWeek(todayStart, { weekStartsOn: 0 });
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 12, 0, 0);

    const pendingItems = validPayables.filter(p => p.status !== 'paid' && p.status !== 'provisioned');

    const mapped = pendingItems.map((item) => {
      const dueDate = parseItemDate(item.due_date || item.competencia);
      if (!dueDate) return null;
      const overdue = dueDate < todayStart;
      const autoDebit = item.payment_modality === 'automatic_debit';
      return {
        id: item.id,
        description: item.description,
        category: item.category,
        dueDate,
        dueDateLabel: format(dueDate, 'dd/MM', { locale: ptBR }),
        amount: Number(item.amount || 0),
        installmentLabel: item.installment_count > 1 ? `${item.installment_number || 1}/${item.installment_count}` : '',
        pill: autoDebit ? 'auto' : overdue ? 'overdue' : 'pending',
        pillLabel: autoDebit ? 'Automático' : overdue ? 'Vencido' : 'Pendente',
        style: overdue ? 'overdue' : (isSameDay(dueDate, todayStart) || isSameDay(dueDate, tomorrow)) ? 'urgent' : 'default',
        autoDebit,
        canPay: true,
        original: item,
      };
    }).filter(Boolean);

    const doneItems = validPayables
      .filter(p => p.status === 'paid' || p.status === 'provisioned')
      .map((item) => {
        const dueDate = parseItemDate(item.due_date || item.competencia);
        const isProvisioned = item.status === 'provisioned';
        return {
          id: item.id,
          description: item.description,
          category: item.category,
          dueDate,
          dueDateLabel: format(dueDate || new Date(), 'dd/MM', { locale: ptBR }),
          amount: Number(item.amount || 0),
          installmentLabel: item.installment_count > 1 ? `${item.installment_number || 1}/${item.installment_count}` : '',
          pill: isProvisioned ? 'provisioned' : 'paid',
          pillLabel: isProvisioned ? 'Cartão' : 'Pago',
          style: 'default',
          autoDebit: false,
          canPay: false,
          original: item,
        };
      });

    const reembolsoItemsList = reembolsoPayables
      .map((item) => {
        const dueDate = parseItemDate(item.due_date || item.competencia);
        const isProvisioned = item.status === 'provisioned';
        const isPaid = item.status === 'paid' || item.status === 'provisioned';
        return {
          id: item.id,
          description: item.description,
          category: item.category,
          dueDate,
          dueDateLabel: format(dueDate || new Date(), 'dd/MM', { locale: ptBR }),
          amount: Number(item.amount || 0),
          installmentLabel: item.installment_count > 1 ? `${item.installment_number || 1}/${item.installment_count}` : '',
          pill: isPaid ? (isProvisioned ? 'provisioned' : 'paid') : (dueDate < todayStart ? 'overdue' : 'pending'),
          pillLabel: isPaid ? (isProvisioned ? 'Cartão' : 'Pago') : (dueDate < todayStart ? 'Vencido' : 'Pendente'),
          style: 'reembolso',
          autoDebit: false,
          canPay: !isPaid,
          original: item,
        };
      });

    const currentMonthKeyLocal = format(currentMonth, 'yyyy-MM');

    return [
      {
        key: 'overdue',
        title: 'Vencidas',
        icon: PAYABLE_SECTION_ICONS.overdue,
        // Só itens do mês atual — itens de meses anteriores já aparecem no banner de alerta
        items: mapped.filter((item) =>
          item.dueDate < todayStart &&
          !item.autoDebit &&
          format(item.dueDate, 'yyyy-MM') === currentMonthKeyLocal
        ),
      },
      { key: 'soon', title: 'Hoje / Amanhã', icon: PAYABLE_SECTION_ICONS.soon, items: mapped.filter((item) => !item.autoDebit && (isSameDay(item.dueDate, today) || isSameDay(item.dueDate, tomorrow))) },
      { key: 'week', title: 'Esta Semana', icon: PAYABLE_SECTION_ICONS.week, items: mapped.filter((item) => !item.autoDebit && item.dueDate > tomorrow && item.dueDate <= weekEnd) },
      { key: 'month', title: 'Restante do Mês', icon: PAYABLE_SECTION_ICONS.month, items: mapped.filter((item) => !item.autoDebit && item.dueDate > weekEnd && item.dueDate <= monthEnd) },
      { key: 'auto', title: 'Débito Automático', icon: PAYABLE_SECTION_ICONS.auto, items: mapped.filter((item) => item.autoDebit) },
      { key: 'paid', title: 'Resolvidas este mês', icon: PAYABLE_SECTION_ICONS.paid, items: doneItems, collapsible: true },
      { key: 'reembolso', title: 'Reembolsos', icon: PAYABLE_SECTION_ICONS.reembolso, items: reembolsoItemsList, collapsible: false },
    ].filter((section) => section.items.length > 0);
  }, [validPayables, reembolsoPayables, currentMonth, todayStart]);

  const deletePayableMutation = useMutation({
    mutationFn: async ({ payable, deleteAllFutures, deleteAllGroup }) => {
      if (deleteAllFutures && payable.recurrence_id) {
        await base44.entities.Recurrence.update(payable.recurrence_id, {
          active: false,
        });
        const payables = await base44.entities.Payable.list('-due_date', 500);
        const toDelete = payables.filter(
          (p) =>
            p.recurrence_id === payable.recurrence_id &&
            p.status !== 'paid' &&
            new Date(p.due_date) >= new Date(payable.due_date)
        );
        for (const p of toDelete) {
          await base44.entities.Payable.delete(p.id);
        }
      } else if (deleteAllFutures && payable.installment_group_id) {
        const payables = await base44.entities.Payable.list('-due_date', 500);
        const toDelete = payables.filter(
          (p) =>
            p.installment_group_id === payable.installment_group_id &&
            p.status !== 'paid' &&
            new Date(p.due_date) >= new Date(payable.due_date)
        );
        for (const p of toDelete) {
          await base44.entities.Payable.delete(p.id);
        }
      } else if (deleteAllGroup && payable.installment_group_id) {
        const payables = await base44.entities.Payable.list('-due_date', 500);
        const toDelete = payables.filter(
          (p) =>
            p.installment_group_id === payable.installment_group_id &&
            p.status !== 'paid'
        );
        for (const p of toDelete) {
          await base44.entities.Payable.delete(p.id);
        }
      } else {
        await base44.entities.Payable.delete(payable.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      setDeletingPayable(null);
      toast.success('Transação excluída.');
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6 font-sora p-4 md:p-6 text-slate-800">
      {viewMode === 'gerenciar_fixas' ? (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Gerenciamento de Fixas
              </h1>
              <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">
                Edite a raiz dos seus custos de vida
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setViewMode('mensal')}
                className="font-bold h-10 px-4 text-slate-600 border-slate-200"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                VOLTAR PARA MESES
              </Button>
            </div>
          </div>
          <ManageAccountsTab
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            onEditRecurrence={(r) => setEditingRecurrence(r)}
            onEditPayable={(p) => setEditingPayable(p)}
            onDeletePayable={(p) => setDeletingPayable(p)}
            payablesItems={payablesItems}
            loadingPayables={loadingPayables}
          />
        </>
      ) : (
        <>
          <div className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3 -mx-6 -mt-6 mb-3">
            <div className="flex items-center gap-3">
              <DashboardLogo className="h-5 w-5" />
              <div className="text-lg font-bold"><span className="text-foreground">Finanças</span><span className="text-primary">Zap</span></div>
              <span className="h-5 w-px bg-border" />
              <p className="text-sm text-muted-foreground">Contas a Pagar</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative"><Bell className="h-4 w-4 text-muted-foreground" /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" /></div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-white">{getInitials('Usuário')}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Controle de Contas</h1>
              <p className="text-sm text-muted-foreground">Visão de caixa do mês</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setViewMode('gerenciar_fixas')} className="gap-2 border-primary/30 text-primary hover:text-primary">
                <Settings className="h-4 w-4" />
                Gerenciar Contas
              </Button>
              <Button onClick={() => setShowForm(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova despesa
              </Button>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[110px] text-center text-sm font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {atrasadasMesesAnteriores.length > 0 && (
            <div className="rounded-[10px] border border-[#FFCDD2] bg-[#FFF5F5] px-5 py-3 flex justify-between items-center mb-3">
              <span className="text-sm text-[#C0392B] font-medium">
                ⚠ {atrasadasMesesAnteriores.length} conta(s) em atraso de meses anteriores
              </span>
              <span className="text-sm font-bold text-[#C0392B]">
                {fmt(totalAtrasadasAnteriores)}
              </span>
            </div>
          )}

          <PayablesOverview
            monthLabel={format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            kpis={kpis}
            sections={urgencySections}
            paidOpen={paidSectionOpen}
            onTogglePaid={() => setPaidSectionOpen((value) => !value)}
            onOpenNew={() => setShowForm(true)}
            onOpenManageRecurring={() => setViewMode('gerenciar_fixas')}
            onOpenPay={(item) => setConfirmingPayable(item)}
          />

          <Button onClick={() => setShowForm(true)} className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden">
            <Plus className="h-5 w-5" />
          </Button>
        </>
      )}

      <AlertDialog
        open={!!deletingPayable}
        onOpenChange={() => setDeletingPayable(null)}
      >
        <AlertDialogContent className="font-sora">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Como deseja excluir essa conta?
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              variant="outline"
              className="font-bold justify-start text-slate-700"
              onClick={() =>
                deletePayableMutation.mutate({
                  payable: deletingPayable,
                  deleteAllFutures: false,
                })
              }
              disabled={deletePayableMutation.isPending}
            >
              Excluir somente essa conta
            </Button>
            {(deletingPayable?.recurrence_id || deletingPayable?.installment_group_id) && (
              <Button
                variant="outline"
                className="font-bold justify-start text-slate-700"
                onClick={() =>
                  deletePayableMutation.mutate({
                    payable: deletingPayable,
                    deleteAllFutures: true,
                  })
                }
                disabled={deletePayableMutation.isPending}
              >
                Excluir essa e as seguintes
              </Button>
            )}
            {(deletingPayable?.recurrence_id || deletingPayable?.installment_group_id) && (
              <Button
                variant="destructive"
                className="font-bold justify-start"
                onClick={() =>
                  deletePayableMutation.mutate({
                    payable: deletingPayable,
                    deleteAllGroup: true,
                  })
                }
                disabled={deletePayableMutation.isPending}
              >
                Excluir todas
              </Button>
            )}
            <AlertDialogCancel className="font-bold mt-2">
              CANCELAR
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {showForm && (
        <ExpenseFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            queryClient.invalidateQueries();
            setShowForm(false);
          }}
        />
      )}
      {confirmingPayable && (
        <ConfirmPayableModal
          payable={confirmingPayable}
          onClose={() => {
            setConfirmingPayable(null);
            queryClient.invalidateQueries();
          }}
        />
      )}
      {editingPayable && (
        <EditPayableModal
          payable={editingPayable}
          onClose={() => setEditingPayable(null)}
          onSaved={() => {
            setEditingPayable(null);
            queryClient.invalidateQueries();
            toast.success('Alteração salva.');
          }}
        />
      )}
      {editingRecurrence && (
        <RecurrenceFormModal
          initial={editingRecurrence}
          onClose={() => setEditingRecurrence(null)}
          onSaved={() => {
            setEditingRecurrence(null);
            queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}