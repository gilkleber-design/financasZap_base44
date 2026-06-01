import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Settings,
  ToggleLeft,
  ToggleRight,
  Bell,
} from 'lucide-react';
import { format, isPast, isToday, addMonths, subMonths, isSameDay, addDays, endOfWeek } from 'date-fns';
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

function RecurrencesTab({ onEdit }) {
  const [showForm, setShowForm] = useState(false);
  const [deletingRecurrence, setDeletingRecurrence] = useState(null);
  const queryClient = useQueryClient();

  const { data: recurrences = [], isLoading } = useQuery({
    queryKey: ['recurrences'],
    queryFn: () => base44.entities.Recurrence.list('-created_date', 100),
  });

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
      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
        <p className="text-sm text-slate-500 font-bold uppercase ml-2">
          {recurrences.filter((r) => r.active !== false).length} Contas Fixas Ativas
        </p>

        <Button
          size="sm"
          onClick={() => setShowForm(true)}
          className="font-bold bg-primary"
        >
          <Plus className="w-4 h-4 mr-1" /> NOVA CONTA FIXA
        </Button>
      </div>

      <Card className="border-0 shadow-sm font-sora bg-white">
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
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
                      onClick={() => onEdit(r)}
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

  // Backend busca os dados do mês
  const { data: payablesResponse } = useQuery({
    queryKey: ['payables-list', monthKey],
    queryFn: () =>
      base44.functions.invoke('listPayables', {
        month: monthKey,
        status: 'TODAS', // Traz tudo. O frontend cuida da regra de negócio.
      }),
    enabled: viewMode === 'mensal',
  });

  const payablesItems = payablesResponse?.data?.items || [];
  const todayStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0), []);

  const parseItemDate = (value) => {
    if (!value) return null;
    const normalized = String(value).includes('T') ? String(value) : `${value}T12:00:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // REGRA DE OURO: Pagamento de fatura (Transferência de Liquidação) é oculto da contabilidade de despesa.
  const validPayables = useMemo(() => {
    return payablesItems.filter(p => p.category !== 'transferencia_liquidacao');
  }, [payablesItems]);

  // KPIs blindados para controle de fluxo de caixa real
  const kpis = useMemo(() => {
    return {
      // Total do Mês: Tudo que foi previsto (Pendentes + Pagos + Provisionados no cartão)
      expected: validPayables.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      // Pago: O que está liquidado ('paid') ou garantido na fatura do cartão ('provisioned')
      paid: validPayables.filter(p => p.status === 'paid' || p.status === 'provisioned').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      // A Vencer: Somente o que ainda vai estourar o prazo (Não inclui provisionado)
      open: validPayables.filter(p => p.status === 'pending' && (() => {
        const date = parseItemDate(p.due_date || p.competencia);
        return date && date >= todayStart;
      })()).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      // Vencido: O que ficou para trás (Não pago)
      overdue: validPayables.filter(p => p.status === 'pending' && (() => {
        const date = parseItemDate(p.due_date || p.competencia);
        return date && date < todayStart;
      })()).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    };
  }, [validPayables, todayStart]);

  if (viewMode === 'mensal') {
    localStorage.setItem('contas_mes', format(currentMonth, 'yyyy-MM'));
  }

  // Distribuição puramente por urgência
  const urgencySections = useMemo(() => {
    const today = new Date();
    const tomorrow = addDays(todayStart, 1);
    const weekEnd = endOfWeek(todayStart, { weekStartsOn: 0 });
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 12, 0, 0);

    // Gavetas de Ação: Somente contas pendentes
    const pendingItems = validPayables.filter(p => p.status === 'pending');
    
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

    // Gaveta de Arquivo Morto: O que já não é um problema hoje (Pago Conta Corrente ou Provisionado Cartão)
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

    return [
      { key: 'overdue', title: 'Vencidas', icon: PAYABLE_SECTION_ICONS.overdue, items: mapped.filter((item) => item.dueDate < todayStart && !item.autoDebit) },
      { key: 'soon', title: 'Hoje / Amanhã', icon: PAYABLE_SECTION_ICONS.soon, items: mapped.filter((item) => !item.autoDebit && (isSameDay(item.dueDate, today) || isSameDay(item.dueDate, tomorrow))) },
      { key: 'week', title: 'Esta Semana', icon: PAYABLE_SECTION_ICONS.week, items: mapped.filter((item) => !item.autoDebit && item.dueDate > tomorrow && item.dueDate <= weekEnd) },
      { key: 'month', title: 'Restante do Mês', icon: PAYABLE_SECTION_ICONS.month, items: mapped.filter((item) => !item.autoDebit && item.dueDate > weekEnd && item.dueDate <= monthEnd) },
      { key: 'auto', title: 'Débito Automático', icon: PAYABLE_SECTION_ICONS.auto, items: mapped.filter((item) => item.autoDebit) },
      { key: 'paid', title: 'Resolvidas este mês', icon: PAYABLE_SECTION_ICONS.paid, items: doneItems, collapsible: true },
    ].filter((section) => section.items.length > 0);
  }, [validPayables, currentMonth, todayStart]);

  const updatePayableMutation = useMutation({
    mutationFn: async ({ payable, updatedData }) => {
      const isVencido =
        isPast(new Date(payable.due_date)) &&
        !isToday(new Date(payable.due_date));

      if (payable.recurrence_id) {
        await base44.entities.Recurrence.update(payable.recurrence_id, {
          amount: updatedData.amount,
          description: updatedData.description,
        });

        if (!isVencido) {
          await base44.entities.Payable.update(payable.id, updatedData);
        } else {
          toast.info(
            'Vencido. Alteração aplicada apenas para os próximos meses.'
          );
        }
      } else {
        await base44.entities.Payable.update(payable.id, updatedData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      setEditingPayable(null);
      toast.success('Alteração salva.');
    },
  });

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
    <div className="p-6 space-y-6 font-sora text-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {viewMode === 'mensal'
              ? 'Contas a Pagar'
              : 'Gerenciamento de Fixas'}
          </h1>

          {viewMode === 'mensal' ? (
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">
              Resumo do Mês · {fmt(kpis.expected)}
            </p>
          ) : (
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">
              Edite a raiz dos seus custos de vida
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              setViewMode(
                viewMode === 'mensal' ? 'gerenciar_fixas' : 'mensal'
              )
            }
            className="font-bold h-10 px-4 text-slate-600 border-slate-200"
          >
            {viewMode === 'mensal' ? (
              <Settings className="w-4 h-4 mr-2" />
            ) : (
              <ChevronLeft className="w-4 h-4 mr-2" />
            )}
            {viewMode === 'mensal'
              ? 'GERENCIAR CONTAS FIXAS'
              : 'VOLTAR PARA MESES'}
          </Button>

          {viewMode === 'mensal' && (
            <Button
              onClick={() => setShowForm(true)}
              className="bg-primary font-bold h-10 px-6"
            >
              <Plus className="w-4 h-4 mr-2" /> NOVA DESPESA
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'gerenciar_fixas' ? (
        <RecurrencesTab onEdit={(r) => setEditingRecurrence(r)} />
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

          <div className="flex items-center justify-between rounded-[14px] border border-border bg-card p-3 shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-sm font-bold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

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
              Como deseja excluir esta transação?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o escopo da remoção para esta conta:
            </AlertDialogDescription>
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
              ❌ EXCLUIR APENAS O MÊS DE{' '}
              {format(currentMonth, 'MMMM', { locale: ptBR }).toUpperCase()}
            </Button>

            {(deletingPayable?.recurrence_id || deletingPayable?.installment_group_id) && (
              <Button
                variant="destructive"
                className="font-bold justify-start text-left whitespace-normal h-auto"
                onClick={() =>
                  deletePayableMutation.mutate({
                    payable: deletingPayable,
                    deleteAllFutures: true,
                  })
                }
                disabled={deletePayableMutation.isPending}
              >
                {deletingPayable?.installment_group_id 
                  ? '⚠️ EXCLUIR ESTA E TODAS AS PARCELAS FUTURAS' 
                  : '⚠️ EXCLUIR ESTE MÊS E DESATIVAR DAQUI PARA FRENTE PRESERVA O PASSADO'}
              </Button>
            )}

            {deletingPayable?.installment_group_id && (
              <Button
                variant="destructive"
                className="font-bold justify-start text-left whitespace-normal h-auto"
                onClick={() =>
                  deletePayableMutation.mutate({
                    payable: deletingPayable,
                    deleteAllGroup: true,
                  })
                }
                disabled={deletePayableMutation.isPending}
              >
                ⚠️ EXCLUIR TODAS AS PARCELAS DA COMPRA
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
          onSaved={(data) =>
            updatePayableMutation.mutate({
              payable: editingPayable,
              updatedData: data,
            })
          }
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