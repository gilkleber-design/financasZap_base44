import { useState } from 'react';
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
    member: transaction.member || 'eu',
    notes: transaction.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.date) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);

    const taxRate = parseFloat(form.tax_rate) || 0;
    const amount = parseFloat(form.amount);
    const netAmount = form.net_amount ? parseFloat(form.net_amount) : (form.type === 'income' && taxRate > 0 ? amount * (1 - taxRate / 100) : amount);

    await base44.entities.Transaction.update(transaction.id, {
      description: form.description,
      amount,
      net_amount: netAmount,
      type: form.type,
      category: form.category || undefined,
      date: form.date,
      tax_rate: taxRate || undefined,
      tax_amount: taxRate > 0 ? amount * taxRate / 100 : undefined,
      member: form.member,
      notes: form.notes || undefined,
    });

    toast.success('Lançamento atualizado!');
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Lançamento</DialogTitle>
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
              <CategorySelect value={form.category} onChange={(value) => set('category', value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor Bruto (R$) *</Label>
              <CurrencyInput value={form.amount} onChange={(value) => set('amount', value)} className="mt-1" />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
            </div>
            {form.type === 'income' && (
              <>
                <div>
                  <Label>Alíquota Imposto (%)</Label>
                  <Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="mt-1" placeholder="0" />
                </div>
                <div>
                  <Label>Membro</Label>
                  <Select value={form.member} onValueChange={v => set('member', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu">Eu</SelectItem>
                      <SelectItem value="conjuge">Cônjuge</SelectItem>
                      <SelectItem value="familia">Família</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
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