import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function ReceivableFormModal({ incomeSources, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', due_date: '', income_source_id: '', tax_rate: '', recurrent: false,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSourceChange = (sourceId) => {
    set('income_source_id', sourceId);
    const src = incomeSources.find(s => s.id === sourceId);
    if (src?.default_tax_rate) set('tax_rate', src.default_tax_rate);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);
    const amount = parseFloat(form.amount);
    const taxRate = parseFloat(form.tax_rate) || 0;
    const netAmount = taxRate > 0 ? amount * (1 - taxRate / 100) : amount;
    await base44.entities.Receivable.create({
      ...form, amount, tax_rate: taxRate || undefined, net_amount: netAmount, status: 'pending',
    });
    setSaving(false);
    toast.success('Conta a receber criada!');
    onSaved();
  };

  const amount = parseFloat(form.amount) || 0;
  const taxRate = parseFloat(form.tax_rate) || 0;
  const netAmount = taxRate > 0 ? amount * (1 - taxRate / 100) : amount;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Conta a Receber</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Pagamento empresa X" />
          </div>
          <div>
            <Label>Fonte de Renda</Label>
            <Select value={form.income_source_id} onValueChange={handleSourceChange}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar (opcional)" /></SelectTrigger>
              <SelectContent>
                {incomeSources.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.type.toUpperCase()})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Bruto (R$) *</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Alíquota Imposto (%)</Label>
              <Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="mt-1" placeholder="0" />
            </div>
            <div>
              <Label>Data Prevista *</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor Líquido</Label>
              <Input value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netAmount)} disabled className="mt-1 bg-muted text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Recorrente (mensal)?</Label>
            <Switch checked={form.recurrent} onCheckedChange={v => set('recurrent', v)} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}