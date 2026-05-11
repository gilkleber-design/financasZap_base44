import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CreditCard, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, Wallet } from 'lucide-react';
import { format, startOfMonth, addMonths, subMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_CONFIG = {
  open:    { label: 'Aberta',   color: 'bg-blue-100 text-blue-700',   icon: Clock },
  closed:  { label: 'Fechada',  color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  paid:    { label: 'Paga',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Vencida',  color: 'bg-red-100 text-red-700',     icon: AlertCircle },
};

function PayInvoiceModal({ invoice, card, accounts, onClose, onPaid }) {
  const [form, setForm] = useState({ account_id: '', paid_date: format(new Date(), 'yyyy-MM-dd') });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handlePay = async () => {
    if (!form.account_id) return toast.error('Selecione a conta corrente');
    setSaving(true);

    // Cria lançamento de despesa
    const tx = await base44.entities.Transaction.create({
      description: `Fatura ${card?.name || 'Cartão'} — ${format(new Date(invoice.month + 'T12:00:00'), 'MMM/yyyy', { locale: ptBR })}`,
      amount: invoice.total_amount,
      net_amount: invoice.total_amount,
      type: 'expense',
      category: 'servicos',
      date: form.paid_date,
      reconciled: true,
      source: 'manual',
      notes: `Pagamento de fatura de cartão — conta: ${form.account_id}`,
    });

    // Atualiza fatura
    await base44.entities.CardInvoice.update(invoice.id, {
      status: 'paid',
      paid_date: form.paid_date,
      paid_account_id: form.account_id,
      transaction_id: tx.id,
    });

    await queryClient.invalidateQueries();
    setSaving(false);
    toast.success('Fatura paga com sucesso!');
    onPaid();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar Fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted/30 rounded-xl p-3 space-y-1">
            <p className="text-sm font-medium">{card?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {format(new Date(invoice.month + 'T12:00:00'), 'MMMM yyyy', { locale: ptBR })}
            </p>
            <p className="text-lg font-bold text-red-500">{fmt(invoice.total_amount)}</p>
          </div>
          <div>
            <Label>Conta Corrente de Débito *</Label>
            <Select value={form.account_id} onValueChange={v => setForm(p => ({ ...p, account_id: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="De qual conta será debitado?" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.bank ? ` — ${a.bank}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data do Pagamento *</Label>
            <Input type="date" className="mt-1" value={form.paid_date} onChange={e => setForm(p => ({ ...p, paid_date: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handlePay} disabled={saving} className="flex-1">
            {saving ? 'Processando...' : 'Confirmar Pagamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CardInvoices() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCard, setSelectedCard] = useState('');
  const [payingInvoice, setPayingInvoice] = useState(null);
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
  const monthStr = format(mStart, 'yyyy-MM-dd');

  // Para o mês/cartão selecionado, calcula despesas no cartão
  const getCardPayables = (cardId) => {
    return payables.filter(p => {
      if (p.origin_id !== cardId || p.origin_type !== 'card') return false;
      if (!p.due_date) return false;
      const d = new Date(p.due_date.includes('T') ? p.due_date : p.due_date + 'T12:00:00');
      return d >= mStart && d <= mEnd;
    });
  };

  const getInvoice = (cardId) => {
    return invoices.find(inv => inv.card_id === cardId && inv.month && inv.month.startsWith(monthStr.slice(0, 7)));
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async ({ cardId, total }) => {
      const card = cards.find(c => c.id === cardId);
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const closingDate = card?.closing_day
        ? format(new Date(year, month, card.closing_day), 'yyyy-MM-dd')
        : format(mEnd, 'yyyy-MM-dd');
      const dueDate = card?.due_day
        ? format(new Date(year, month + 1, card.due_day), 'yyyy-MM-dd')
        : null;

      return base44.entities.CardInvoice.create({
        card_id: cardId,
        month: monthStr,
        total_amount: total,
        status: 'open',
        closing_date: closingDate,
        due_date: dueDate,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['card_invoices']); toast.success('Fatura gerada!'); },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Faturas de Cartão</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie e quite as faturas dos seus cartões</p>
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
          const cardPayables = getCardPayables(card.id);
          const total = cardPayables.reduce((s, p) => s + (p.amount || 0), 0);
          const existingInvoice = getInvoice(card.id);
          const StatusIcon = existingInvoice ? (STATUS_CONFIG[existingInvoice.status]?.icon || Clock) : Clock;

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
                    {existingInvoice ? (
                      <Badge className={`text-xs border-0 ${STATUS_CONFIG[existingInvoice.status]?.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {STATUS_CONFIG[existingInvoice.status]?.label}
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

                {/* Despesas do mês neste cartão */}
                {cardPayables.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {cardPayables.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2">
                        <p className="text-sm truncate flex-1">{p.description}</p>
                        <span className="text-sm font-medium text-red-500 flex-shrink-0 ml-2">{fmt(p.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                      <p className="text-sm font-semibold">Total da Fatura</p>
                      <span className="text-sm font-bold text-red-500">{fmt(total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3 bg-muted/20 rounded-lg">
                    Nenhuma despesa provisionada neste cartão para o mês
                  </p>
                )}

                {/* Ações */}
                <div className="flex gap-2">
                  {!existingInvoice && cardPayables.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => createInvoiceMutation.mutate({ cardId: card.id, total })}
                      disabled={createInvoiceMutation.isPending}
                    >
                      Gerar Fatura
                    </Button>
                  )}
                  {existingInvoice && existingInvoice.status !== 'paid' && (
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setPayingInvoice({ invoice: existingInvoice, card })}
                    >
                      <Wallet className="w-3.5 h-3.5 mr-1.5" />
                      Quitar Fatura — {fmt(existingInvoice.total_amount)}
                    </Button>
                  )}
                  {existingInvoice?.status === 'paid' && existingInvoice.paid_account_id && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 flex-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Paga em {existingInvoice.paid_date ? format(new Date(existingInvoice.paid_date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                      {' '}· {accounts.find(a => a.id === existingInvoice.paid_account_id)?.name || 'Conta'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {payingInvoice && (
        <PayInvoiceModal
          invoice={payingInvoice.invoice}
          card={payingInvoice.card}
          accounts={accounts}
          onClose={() => setPayingInvoice(null)}
          onPaid={() => setPayingInvoice(null)}
        />
      )}
    </div>
  );
}