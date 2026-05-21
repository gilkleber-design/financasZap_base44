import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2 } from 'lucide-react';
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

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const initialAmount = payable.amount || 0;
  const fmtInitial = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(initialAmount);

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: fmtInitial,
    origin_id: '',
    origin_type: '',
    notes: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Usa origem configurada no Payable ou padrão
  useEffect(() => {
    if (!form.origin_id) {
      if (payable.origin_id && payable.origin_type) {
        set('origin_id', payable.origin_id);
        set('origin_type', payable.origin_type);
      } else if (accounts.length > 0) {
        const bradesco = accounts.find(a => a.bank?.toLowerCase().includes('bradesco'));
        const defaultAccount = bradesco ? bradesco.id : accounts[0].id;
        set('origin_id', defaultAccount);
        set('origin_type', 'account');
      }
    }
  }, [accounts, payable]);

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

    setSaving(true);

    const amount = parseAmount(form.amount);

    // Cria transação de despesa
    const tx = await base44.entities.Transaction.create({
      description: payable.description,
      amount,
      net_amount: amount,
      type: 'expense',
      category: payable.category || 'outros',
      date: form.date,
      payable_id: payable.id,
      reconciled: true,
      source: 'manual',
      notes: form.notes || undefined,
      ...(form.origin_id && form.origin_type === 'account' ? { account_id: form.origin_id } : {}),
      ...(form.origin_id && form.origin_type === 'card' ? { card_id: form.origin_id } : {}),
    });

    // Marca conta como paga
    await base44.entities.Payable.update(payable.id, {
      status: 'paid',
      amount,
      transaction_id: tx.id,
    });

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
              <p className="text-sm text-muted-foreground mt-1">Transação criada com sucesso.</p>
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
            <p className="text-sm font-medium truncate">{payable.description}</p>
          </div>
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
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id || '_none'} onValueChange={(value) => {
              const acc = accounts.find(o => o.id === value);
              const crd = cards.find(o => o.id === value);
              if (acc) {
                set('origin_id', acc.id);
                set('origin_type', 'account');
              } else if (crd) {
                set('origin_id', crd.id);
                set('origin_type', 'card');
              } else {
                set('origin_id', '');
                set('origin_type', '');
              }
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar conta ou cartão..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Nenhuma —</SelectItem>
                {accounts.filter(a => a.active !== false).length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Contas Correntes</div>
                    {accounts.filter(a => a.active !== false).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}{a.bank ? ` — ${a.bank}` : ''}</SelectItem>
                    ))}
                  </>
                )}
                {cards.filter(c => c.active !== false).length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">💳 Cartões de Crédito</div>
                    {cards.filter(c => c.active !== false).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="mt-1"
              placeholder="Opcional..."
            />
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