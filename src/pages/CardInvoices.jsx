import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, RefreshCw, Pencil, Upload, Undo2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, startOfMonth, addMonths, subMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditInvoiceItemsModal from '@/components/cardInvoices/EditInvoiceItemsModal';
import ImportInvoicePDFModal from '@/components/cardInvoices/ImportInvoicePDFModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_CONFIG = {
  open:    { label: 'Aberta',   color: 'bg-blue-100 text-blue-700',       icon: Clock },
  closed:  { label: 'Fechada',  color: 'bg-amber-100 text-amber-700',     icon: AlertCircle },
  paid:    { label: 'Paga',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Vencida',  color: 'bg-red-100 text-red-700',         icon: AlertCircle },
};

const STATUS_ITEM_COLORS = {
  provisioned: 'bg-blue-100 text-blue-700',
  paid:        'bg-emerald-100 text-emerald-700',
  pending:     'bg-amber-100 text-amber-700',
};

export default function CardInvoices() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [payingPayable, setPayingPayable] = useState(null);
  const [editingInvoiceItems, setEditingInvoiceItems] = useState(null);
  const [importingCard, setImportingCard] = useState(null); // { card, refMonth }
  const [reopeningInvoice, setReopeningInvoice] = useState(null); // { invoice, invoicePayable }
  const queryClient = useQueryClient();

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['card_invoices'],
    queryFn: () => base44.entities.CardInvoice.list('-month', 200),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
  });

  const creditCards = cards.filter(c => c.type === 'credit' || c.type === 'both');

  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);
  const refMonthStr = format(mStart, 'yyyy-MM');

  // Itens individuais do cartão no mês
  const getCardItems = (cardId) => {
    const card = creditCards.find(c => c.id === cardId);
    const closingDay = card?.closing_day || 1;
    const [refYear, refMon] = refMonthStr.split('-').map(Number);
    const currentClosing = new Date(refYear, refMon - 1, closingDay);
    const prevClosing = new Date(refYear, refMon - 2, closingDay);

    return payables.filter(p => {
      if (p.origin_id !== cardId || p.origin_type !== 'card') return false;
      if (p.is_card_invoice_payable) return false;

      // Itens provisioned (PDF): usa competencia começando com refMonthStr
      if (p.status === 'provisioned') {
        const comp = p.competencia || p.due_date;
        return comp && comp.startsWith(refMonthStr);
      }

      // Itens pending de recorrência de cartão: usa janela de fechamento
      if ((p.status === 'pending' || p.status === 'scheduled') && p.payment_modality === 'card_invoice') {
        const dueDateStr = (p.due_date || '').replace('T12:00:00', '').slice(0, 10);
        if (!dueDateStr) return false;
        const dueDate = new Date(dueDateStr + 'T12:00:00');
        return dueDate > prevClosing && dueDate <= currentClosing;
      }

      return false;
    });
  };

  // Payable consolidado "Fatura XXXXX" para o mês
  const getInvoicePayable = (cardId) => {
    return payables.find(p =>
      p.origin_id === cardId &&
      p.is_card_invoice_payable === true &&
      (p.competencia || p.due_date || '').startsWith(refMonthStr)
    );
  };

  const getInvoice = (cardId) => {
    return invoices.find(inv => inv.card_id === cardId && inv.month && inv.month.startsWith(refMonthStr));
  };

  const generateMutation = useMutation({
    mutationFn: async (cardId) => {
      const result = await base44.functions.invoke('generateCardInvoices', {
        forceCardId: cardId,
        forceMonth: format(mStart, 'yyyy-MM') + '-01',
      });
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      const r = data?.results?.[0];
      if (r?.status === 'created') {
        const invoicePayableId = r.invoicePayableId;
        const payable = payables.find(p => p.id === invoicePayableId);
        const dueDate = payable?.due_date 
          ? format(new Date(payable.due_date.includes('T') ? payable.due_date : payable.due_date + 'T12:00:00'), 'dd/MM/yyyy')
          : 'data não definida';
        toast.success(`Fatura fechada! ${r.items} itens · ${fmt(r.total)} · Vence em ${dueDate}`);
      }
      else if (r?.status === 'already_exists') toast.info('Fatura já existe para este mês');
      else if (r?.status === 'no_items') toast.info('Nenhum item provisionado para este mês');
      else toast.success('Processado');
    },
    onError: () => toast.error('Erro ao gerar fatura'),
  });

  const reopenInvoiceMutation = useMutation({
    mutationFn: async ({ invoice, invoicePayable }) => {
      // Remove o payable consolidado
      if (invoicePayable?.id) await base44.entities.Payable.delete(invoicePayable.id);
      // Remove o CardInvoice
      if (invoice?.id) await base44.entities.CardInvoice.delete(invoice.id);
      // Reverte itens vinculados para 'provisioned'
      if (invoice?.id) {
        const items = await base44.entities.Payable.filter({ card_invoice_id: invoice.id }, '-due_date', 500);
        await Promise.all(items.map(item =>
          base44.entities.Payable.update(item.id, { card_invoice_id: null, status: item.status === 'paid' ? 'provisioned' : item.status })
        ));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setReopeningInvoice(null);
      toast.success('Fatura reaberta! Itens retornaram para provisionado.');
    },
    onError: () => toast.error('Erro ao reabrir fatura'),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Faturas de Cartão</h1>
          <p className="text-muted-foreground text-sm mt-1">Regime de competência — itens individuais agrupados por fatura</p>
        </div>
      </div>

      {/* Navegação de mês */}
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

      {creditCards.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhum cartão de crédito cadastrado. Adicione em <strong>Configurações</strong>.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {creditCards.map(card => {
          const items = getCardItems(card.id);
          const total = items.reduce((s, p) => s + (p.amount || 0), 0);
          const existingInvoice = getInvoice(card.id);
          const invoicePayable = getInvoicePayable(card.id);
          const invoiceStatus = existingInvoice?.status || (invoicePayable?.status === 'paid' ? 'paid' : null);
          const StatusIcon = invoiceStatus ? (STATUS_CONFIG[invoiceStatus]?.icon || Clock) : null;

          return (
            <Card key={card.id} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    {card.name}
                    {card.bank && <span className="text-muted-foreground font-normal text-sm">— {card.bank}</span>}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {invoiceStatus ? (
                      <Badge className={`text-xs border-0 ${STATUS_CONFIG[invoiceStatus]?.color}`}>
                        {StatusIcon && <StatusIcon className="w-3 h-3 mr-1" />}
                        {STATUS_CONFIG[invoiceStatus]?.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Sem fatura</Badge>
                    )}
                  </div>
                </div>
                {(card.closing_day || card.due_day) && (
                  <p className="text-xs text-muted-foreground">
                    {card.closing_day && `Fecha dia ${card.closing_day}`}
                    {card.closing_day && card.due_day && ' · '}
                    {card.due_day && `Vence dia ${card.due_day}`}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">

                {/* Itens individuais */}
                {items.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {items.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{p.description}</p>
                          {(p.purchase_date || p.due_date) && (
                            <p className="text-xs text-muted-foreground">
                              Data compra: {format(new Date((p.purchase_date || p.due_date).includes('T') ? (p.purchase_date || p.due_date) : (p.purchase_date || p.due_date) + 'T12:00:00'), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <Badge className={`text-xs border-0 py-0 h-4 px-1.5 ${p.status === 'paid' ? STATUS_ITEM_COLORS.paid : STATUS_ITEM_COLORS.provisioned}`}>
                            {p.status === 'paid' ? 'Pago' : 'Provisionado'}
                          </Badge>
                          <span className="text-sm font-medium text-red-500">{fmt(p.amount)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                      <p className="text-sm font-semibold">Total</p>
                      <span className="text-sm font-bold text-red-500">{fmt(total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3 bg-muted/20 rounded-lg">
                    Nenhuma despesa provisionada para este mês
                  </p>
                )}

                {/* Fatura consolidada */}
                {invoicePayable && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fatura Consolidada</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{invoicePayable.description}</p>
                      <p className="text-sm font-bold text-red-500">{fmt(invoicePayable.amount)}</p>
                    </div>
                    {invoicePayable.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Vence: {format(new Date(invoicePayable.due_date.includes('T') ? invoicePayable.due_date : invoicePayable.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                      </p>
                    )}
                    {invoicePayable.status === 'paid' && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 rounded px-2 py-1 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Paga · {accounts.find(a => a.id === existingInvoice?.paid_account_id)?.name || ''}
                      </div>
                    )}
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setImportingCard({ card, refMonth: refMonthStr })}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Importar PDF
                  </Button>
                  {items.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setEditingInvoiceItems(items)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Editar Itens
                    </Button>
                  )}
                  {!invoicePayable && items.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => generateMutation.mutate(card.id)}
                      disabled={generateMutation.isPending}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                      Fechar Fatura
                    </Button>
                  )}
                  {invoicePayable && invoicePayable.status !== 'paid' && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setPayingPayable(invoicePayable)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Pagar Fatura — {fmt(invoicePayable.amount)}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => setReopeningInvoice({ invoice: existingInvoice, invoicePayable })}
                      >
                        <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                        Reabrir
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {payingPayable && (
        <ConfirmPayableModal
          payable={payingPayable}
          onClose={() => {
            setPayingPayable(null);
            queryClient.invalidateQueries();
          }}
        />
      )}

      {editingInvoiceItems && (
        <EditInvoiceItemsModal
          items={editingInvoiceItems}
          onClose={() => setEditingInvoiceItems(null)}
          onSaved={() => { queryClient.invalidateQueries(); setEditingInvoiceItems(null); }}
        />
      )}

      {importingCard && (
        <ImportInvoicePDFModal
          card={importingCard.card}
          refMonth={importingCard.refMonth}
          onClose={() => setImportingCard(null)}
          onImported={() => { queryClient.invalidateQueries(); setImportingCard(null); }}
        />
      )}

      {reopeningInvoice && (
        <AlertDialog open onOpenChange={() => setReopeningInvoice(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir fatura?</AlertDialogTitle>
              <AlertDialogDescription>
                A fatura consolidada será removida e os itens voltarão para "provisionado". Você poderá fechar novamente depois.
                {reopeningInvoice.invoice?.status === 'paid' && (
                  <span className="block mt-2 text-red-600 font-medium">⚠️ Esta fatura já foi marcada como PAGA. Reabrir irá remover o registro de pagamento, mas o lançamento de despesa NÃO será excluído automaticamente.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => reopenInvoiceMutation.mutate(reopeningInvoice)}
                disabled={reopenInvoiceMutation.isPending}
              >
                {reopenInvoiceMutation.isPending ? 'Reabrindo...' : 'Reabrir Fatura'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}