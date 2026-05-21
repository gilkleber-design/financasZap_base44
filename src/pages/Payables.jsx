import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Undo2,
  Settings,
  ToggleLeft,
  ToggleRight,
  CreditCard,
} from 'lucide-react';
import { format, isPast, isToday, addMonths, subMonths } from 'date-fns';
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
import { useCategories } from '@/hooks/useCategories';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v || 0);

const STATUS_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  provisioned: 'Provisionado',
};

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  provisioned: 'bg-blue-100 text-blue-700',
};

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
          {recurrences.filter((r) => r.active !== false).length} Contas Fixas
          Ativas
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
  const [activeTab, setActiveTab] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [confirmingPayable, setConfirmingPayable] = useState(null);
  const [editingPayable, setEditingPayable] = useState(null);
  const [editingRecurrence, setEditingRecurrence] = useState(null);
  const [deletingPayable, setDeletingPayable] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterBy, setFilterBy] = useState('due_date');
  const [creditCardOnly, setCreditCardOnly] = useState(false);

  const queryClient = useQueryClient();
  const { getCategoryLabel } = useCategories();

  const listFilter =
    activeTab === 'fixas'
      ? 'FIXAS'
      : activeTab === 'parceladas'
      ? 'PARCELADAS'
      : activeTab === 'avulsas'
      ? 'AVULSAS'
      : 'TODAS';

  const listStatus =
    filterStatus === 'open'
      ? 'EM_ABERTO'
      : filterStatus === 'overdue'
      ? 'VENCIDAS'
      : 'PAGAS';

  const monthKey = format(currentMonth, 'yyyy-MM');

  const { data: payablesResponse } = useQuery({
    queryKey: ['payables-list', monthKey, listFilter, listStatus, filterBy],
    queryFn: () =>
      base44.functions.invoke('listPayables', {
        month: monthKey,
        filter: listFilter,
        status: listStatus,
        sort: filterBy,
      }),
    enabled: viewMode === 'mensal',
  });

  const payablesItems = payablesResponse?.data?.items || [];

  const filtered = creditCardOnly
    ? payablesItems.filter((p) => {
        const method = (
          p.payment_method ||
          p.forma_pagamento ||
          p.paymentMethod ||
          p.payment_type ||
          p.formaPagamento ||
          p.method ||
          ''
        )
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        return (
          method.includes('credito') ||
          method.includes('cartao') ||
          method.includes('credit_card') ||
          method.includes('creditcard')
        );
      })
    : payablesItems;

  const getStatus = (p) => {
    if (p.status === 'paid') return 'paid';

    if (
      p.due_date &&
      isPast(new Date(p.due_date)) &&
      !isToday(new Date(p.due_date))
    ) {
      return 'overdue';
    }

    return p.status || 'pending';
  };

  const totalFiltered = filtered.reduce((s, p) => s + (p.amount || 0), 0);

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
    mutationFn: async ({ payable, deleteAllFutures }) => {
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

  const undoPaymentMutation = useMutation({
    mutationFn: async (p) => {
      if (p.transaction_id) {
        await base44.entities.Transaction.delete(p.transaction_id);
      }

      return await base44.entities.Payable.update(p.id, {
        status: 'pending',
        transaction_id: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      toast.success('Pagamento desfeito.');
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
              {filterStatus === 'open'
                ? `Pendentes · ${fmt(totalFiltered)}`
                : filterStatus === 'overdue'
                ? `Vencidas · ${fmt(totalFiltered)}`
                : `Pagas · ${fmt(totalFiltered)}`}
              {creditCardOnly ? ' · Cartão de Crédito' : ''}
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
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {['todas', 'fixas', 'parceladas', 'avulsas'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                  activeTab === tab
                    ? 'bg-white shadow text-primary'
                    : 'text-slate-500'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {['open', 'overdue', 'paid'].map((s) => (
              <Button
                key={s}
                variant={filterStatus === s ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus(s)}
                className="text-[10px] font-black uppercase h-7 tracking-tighter"
              >
                {s === 'open'
                  ? 'Em Aberto'
                  : s === 'overdue'
                  ? 'Vencidas'
                  : 'Pagas'}
              </Button>
            ))}

            <Button
              variant={creditCardOnly ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setCreditCardOnly((prev) => !prev)}
              className="text-[10px] font-black uppercase h-7 tracking-tighter"
            >
              <CreditCard className="w-3 h-3 mr-1" />
              Cartão de Crédito
            </Button>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <span className="text-sm font-bold min-w-[120px] text-center capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl">
              <Button
                variant={filterBy === 'due_date' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterBy('due_date')}
                className="text-[9px] font-black h-6 px-3"
              >
                VENCIMENTO
              </Button>

              <Button
                variant={filterBy === 'competencia' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterBy('competencia')}
                className="text-[9px] font-black h-6 px-3"
              >
                COMPETÊNCIA
              </Button>
            </div>
          </div>

          <Card className="border-0 shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <p className="p-16 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                    Nenhuma transação encontrada
                  </p>
                )}

                {filtered.map((p) => {
                  const status = getStatus(p);

                  const dateToShow =
                    filterBy === 'competencia'
                      ? p.competencia || p.due_date
                      : p.due_date;

                  const parsedDate = new Date(
                    dateToShow?.includes('T')
                      ? dateToShow
                      : `${dateToShow}T12:00:00`
                  );

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-4 px-5 py-4 transition-colors ${
                        p.is_projection
                          ? 'bg-slate-50/60 opacity-60'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div
                        className={`w-1.5 h-11 rounded-full flex-shrink-0 ${
                          status === 'paid'
                            ? 'bg-emerald-500'
                            : status === 'overdue'
                            ? 'bg-red-500'
                            : 'bg-amber-400'
                        }`}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 font-bold mb-0.5">
                          <p className="text-sm truncate text-slate-800 uppercase tracking-tight">
                            {p.description}
                          </p>

                          {p.is_projection && (
                            <Badge className="bg-slate-100 text-slate-500 border-none text-[9px] px-2 font-black uppercase">
                              Projeção
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          {format(parsedDate, 'dd MMM yyyy', {
                            locale: ptBR,
                          })}

                          {p.category && (
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              {getCategoryLabel(p.category)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 mr-4">
                        <p className="text-sm font-black text-slate-900">
                          -{fmt(p.amount)}
                        </p>

                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            STATUS_COLORS[status] || STATUS_COLORS.pending
                          }`}
                        >
                          {STATUS_LABELS[status] || status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {p.is_projection ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-slate-300 hover:text-red-500"
                            onClick={() => setViewMode('gerenciar_fixas')}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-slate-400 hover:text-primary"
                              onClick={() => setEditingPayable(p)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>

                            {status !== 'paid' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => setConfirmingPayable(p)}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                PAGAR
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-amber-500 hover:bg-amber-50"
                                onClick={() => undoPaymentMutation.mutate(p)}
                                disabled={undoPaymentMutation.isPending}
                                title="Desfazer pagamento"
                              >
                                <Undo2
                                  className={`w-5 h-5 ${
                                    undoPaymentMutation.isPending
                                      ? 'animate-spin'
                                      : ''
                                  }`}
                                />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-slate-300 hover:text-red-500"
                              onClick={() => setDeletingPayable(p)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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

            {deletingPayable?.recurrence_id && (
              <Button
                variant="destructive"
                className="font-bold justify-start"
                onClick={() =>
                  deletePayableMutation.mutate({
                    payable: deletingPayable,
                    deleteAllFutures: true,
                  })
                }
                disabled={deletePayableMutation.isPending}
              >
                ⚠️ EXCLUIR ESTE MÊS E DESATIVAR DAQUI PARA FRENTE PRESERVA O
                PASSADO
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