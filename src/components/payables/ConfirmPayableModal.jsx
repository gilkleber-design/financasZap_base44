import { useState } from 'react';
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

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: String(payable.amount || ''),
    account_id: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const handleConfirm = async () => {
    if (!form.date || !form.amount) return toast.error('Preencha data e valor');
    setSaving(true);

    const amount = parseFloat(form.amount);

    // Cria lançamento de despesa
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
      ...(form.account_id ? { account_id: form.account_id } : {}),
    });

    // Marca conta como paga, atualiza valor real e vincula lançamento
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
              <p className="text-sm text-muted-foreground mt-1">Lançamento criado com sucesso.</p>
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
          <p className="text-sm font-medium truncate">{payable.description}</p>
          <p className="text-xs text-muted-foreground">
            Valor previsto: <span className="font-semibold text-red-500">{fmt(payable.amount)}</span>
          </p>
        </div>

        <div className="space-y-4 py-1">
          <div>
            <Label>Data do Pagamento *</Label>
            <Input type="date" className="mt-1" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <Label>Valor Pago (R$) *</Label>
            <Input type="number" className="mt-1" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <Label>Conta de Pagamento</Label>
            <Select value={form.account_id} onValueChange={v => set('account_id', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar conta (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name} — {a.bank}</SelectItem>
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