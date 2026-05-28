import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect } from '@/components/ui/category-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { toast } from 'sonner';

export default function EditTransactionModal({ transaction, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: transaction.description || '',
    amount: transaction.amount || '',
    net_amount: transaction.net_amount || '',
    type: transaction.type || 'expense',
    category: transaction.category || '',
    date: transaction.date || '',
    tax_rate: transaction.tax_rate || '',
    notes: transaction.notes || '',
    origin: transaction.account_id ? `account:${transaction.account_id}` : (transaction.card_id ? `card:${transaction.card_id}` : ''),
  });
  const [saving, setSaving] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list('', 100),
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list('', 100),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.date) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);

    const taxRate = parseFloat(form.tax_rate) || 0;
    const amount = parseFloat(form.amount);
    const netAmount = form.net_amount ? parseFloat(form.net_amount) : (form.type === 'income' && taxRate > 0 ? amount * (1 - taxRate / 100) : amount);

    const isAccount = form.origin?.startsWith('account:');
    const isCard = form.origin?.startsWith('card:');
    const originId = form.origin?.split(':')[1];

    await base44.entities.Transaction.update(transaction.id, {
      description: form.description,
      amount,
      net_amount: netAmount,
      type: form.type,
      category: form.category || null,
      date: form.date,
      tax_rate: taxRate || undefined,
      tax_amount: taxRate > 0 ? amount * taxRate / 100 : undefined,
      notes: form.notes || undefined,
      account_id: isAccount ? originId : null,
      card_id: isCard ? originId : null,
    });

    toast.success('Transação atualizada!');
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Transação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Despesa</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <CategorySelect value={form.category} onChange={(value) => set('category', value)} allowedTypes={form.type === 'income' ? ['income'] : ['expense', 'transfer']} className="mt-1" />
            </div>
            <div>
              <Label>Valor Bruto (R$) *</Label>
              <CurrencyInput value={form.amount} onChange={(value) => set('amount', value)} className="mt-1" />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
            </div>

            <div className="col-span-2">
              <Label>Origem (Conta/Cartão) *</Label>
              <Select value={form.origin} onValueChange={v => set('origin', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a origem..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nenhuma —</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={`account:${a.id}`} value={`account:${a.id}`}>
                      🏦 {a.name} {a.bank ? `(${a.bank})` : ''}
                    </SelectItem>
                  ))}
                  {cards.map(c => (
                    <SelectItem key={`card:${c.id}`} value={`card:${c.id}`}>
                      💳 {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.type === 'income' && (
              <div>
                <Label>Alíquota Imposto (%)</Label>
                <Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="mt-1" placeholder="0" />
              </div>
            )}
            <div className="col-span-2">
              <Label>Observação</Label>
              <Input
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                className="mt-1"
                placeholder="Observações adicionais..."
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}