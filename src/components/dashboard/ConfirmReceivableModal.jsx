import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ConfirmReceivableModal({ receivable, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const initialAmount = receivable.net_amount || receivable.amount || 0;
  const fmtInitial = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(initialAmount);

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: fmtInitial,
    account_id: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Default Bradesco quando as contas carregarem
  useEffect(() => {
    if (accounts.length > 0 && !form.account_id) {
      const bradesco = accounts.find(a => a.bank?.toLowerCase().includes('bradesco'));
      if (bradesco) set('account_id', bradesco.id);
    }
  }, [accounts]);

  const handleConfirm = async () => {
    if (!form.date || !form.amount) return toast.error('Preencha data e valor');
    setSaving(true);

    const amount = parseFloat(form.amount.replace(/\D/g, '')) / 100;
    const taxRate = receivable.tax_rate || 0;
    const grossAmount = taxRate > 0 ? amount / (1 - taxRate / 100) : amount;

    // Cria lançamento de receita
    const tx = await base44.entities.Transaction.create({
      description: receivable.description,
      amount: grossAmount,
      net_amount: amount,
      type: 'income',
      category: 'receita_pj',
      date: form.date,
      tax_rate: taxRate || undefined,
      tax_amount: taxRate > 0 ? grossAmount - amount : undefined,
      income_source_id: receivable.income_source_id || undefined,
      receivable_id: receivable.id,
      reconciled: true,
      source: 'manual',
      ...(form.account_id ? { account_id: form.account_id } : {}),
    });

    // Marca recebível como recebido, atualiza valor real e vincula o lançamento
    await base44.entities.Receivable.update(receivable.id, {
      status: 'received',
      net_amount: amount,
      amount: grossAmount,
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
              <p className="text-lg font-bold text-emerald-700">Recebimento confirmado!</p>
              <p className="text-sm text-muted-foreground mt-1">Lançamento criado com sucesso.</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={onClose} className="flex-1">Fechar</Button>
              <Button
                className="flex-1"
                onClick={() => { window.location.href = '/lancamentos'; }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Editar Lançamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar Recebimento</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 py-1 px-1 bg-muted/30 rounded-xl p-3">
          <p className="text-sm font-medium truncate">{receivable.description}</p>
          <p className="text-xs text-muted-foreground">Valor previsto: <span className="font-semibold text-emerald-600">{fmt(receivable.net_amount || receivable.amount)}</span></p>
        </div>

        <div className="space-y-4 py-1">
          <div>
            <Label>Data do Pagamento *</Label>
            <Input type="date" className="mt-1" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <Label>Valor Recebido *</Label>
            <Input
              type="text"
              inputMode="numeric"
              className="mt-1"
              value={form.amount}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '');
                if (!digits) { set('amount', ''); return; }
                const num = parseFloat(digits) / 100;
                set('amount', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num));
              }}
              placeholder="R$ 0,00"
            />
          </div>
          <div>
            <Label>Conta de Recebimento</Label>
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