import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ConfirmPayableModal({ payable, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const isCardInvoice = !!payable.is_card_invoice_payable;

  const initialAmount = payable.amount || 0;
  const fmtInitial = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(initialAmount);

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: fmtInitial,
    account_id: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Default para primeira conta disponível
  useEffect(() => {
    if (accounts.length > 0 && !form.account_id) {
      const bradesco = accounts.find(a => a.bank?.toLowerCase().includes('bradesco'));
      set('account_id', bradesco ? bradesco.id : accounts[0].id);
    }
  }, [accounts]);

  const parseAmount = (str) => {
    const digits = str.replace(/\D/g, '');
    return parseFloat(digits) / 100;
  };

  const formatCurrency = (str) => {
    const digits = str.replace(/\D/g, '');
    const num = parseFloat(digits) / 100;
    if (!digits) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const handleConfirm = async () => {
    if (!form.date || !form.amount) return toast.error('Preencha data e valor');
    if (isCardInvoice && !form.account_id) return toast.error('Selecione a conta corrente de débito');

    setSaving(true);

    const amount = parseAmount(form.amount);

    // Cria lançamento de despesa
    const tx = await base44.entities.Transaction.create({
      description: payable.description,
      amount,
      net_amount: amount,
      type: 'expense',
      // Fatura de cartão usa categoria de transferência (não aparece no DRE)
      category: isCardInvoice ? 'transferencia_liquidacao' : (payable.category || 'outros'),
      date: form.date,
      payable_id: payable.id,
      reconciled: true,
      source: 'manual',
      ...(form.account_id ? { account_id: form.account_id } : {}),
    });

    // Marca conta como paga
    await base44.entities.Payable.update(payable.id, {
      status: 'paid',
      amount,
      transaction_id: tx.id,
    });

    // Se é fatura de cartão, dispara a cascata de status nos itens individuais
    if (isCardInvoice) {
      await base44.functions.invoke('cascadeCardInvoicePayment', {
        payable_id: payable.id,
      });
    }

    await queryClient.invalidateQueries();
    setDone(true);
    setSaving(false);
  };

  if (done) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700">Pagamento confirmado!</p>
              {isCardInvoice && (
                <p className="text-sm text-muted-foreground mt-1">
                  Todos os itens da fatura foram marcados como pagos.
                </p>
              )}
              {!isCardInvoice && (
                <p className="text-sm text-muted-foreground mt-1">Lançamento criado com sucesso.</p>
              )}
            </div>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 py-1 bg-muted/30 rounded-xl p-3">
          <div className="flex items-center gap-2">
            {isCardInvoice && <CreditCard className="w-4 h-4 text-primary flex-shrink-0" />}
            <p className="text-sm font-medium truncate">{payable.description}</p>
          </div>
          {isCardInvoice && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mt-1">
              💳 Fatura de cartão — o pagamento será debitado da conta selecionada abaixo
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Valor previsto: <span className="font-semibold text-red-500">{fmt(payable.amount)}</span>
          </p>
        </div>

        <div className="space-y-4 py-1">
          <div>
            <Label>Data do Pagamento *</Label>
            <Input type="date" className="mt-1" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <Label>Valor Pago *</Label>
            <Input
              type="text"
              inputMode="numeric"
              className="mt-1"
              value={form.amount}
              onChange={e => set('amount', formatCurrency(e.target.value))}
              placeholder="R$ 0,00"
            />
          </div>
          <div>
            <Label>{isCardInvoice ? 'Conta Corrente de Débito *' : 'Conta de Pagamento'}</Label>
            <Select value={form.account_id} onValueChange={v => set('account_id', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={isCardInvoice ? 'Selecionar conta obrigatório' : 'Selecionar conta (opcional)'} />
              </SelectTrigger>
              <SelectContent>
                {!isCardInvoice && <SelectItem value="_none">— Nenhuma —</SelectItem>}
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}{a.bank ? ` — ${a.bank}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving} className="flex-1">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}