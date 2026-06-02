import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from '@/components/ui/category-select';

export default function ReceivableFormModal({ incomeSources, categories = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', due_date: '', competencia: '', income_source_id: '', category_id: '', tax_rate: '', recurrent: false, notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSourceChange = (sourceId) => {
    set('income_source_id', sourceId);
    const src = incomeSources.find(s => s.id === sourceId);
    if (src?.default_tax_rate) set('tax_rate', src.default_tax_rate);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date || !form.category_id) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);
    const amount = parseFloat(form.amount) || 0;
    const taxRate = parseFloat(form.tax_rate) || 0;
    const netAmount = taxRate > 0 ? amount * (1 - taxRate / 100) : amount;
    const category = categories.find((item) => item.id === form.category_id);
    try {
      await base44.entities.Receivable.create({
        ...form,
        amount,
        tax_rate: taxRate || undefined,
        net_amount: netAmount || amount || 0,
        status: 'pending',
        competencia: form.competencia || form.due_date,
        category: category?.slug || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Conta a receber criada!');
      onSaved();
    } catch (error) {
      console.error('Erro ao salvar receivable:', error);
      toast.error(`Erro ao salvar: ${error?.message || 'tente novamente'}`);
    } finally {
      setSaving(false);
    }
  };

  const amount = parseFloat(form.amount) || 0;
  const taxRate = parseFloat(form.tax_rate) || 0;
  const netAmount = taxRate > 0 ? amount * (1 - taxRate / 100) : amount;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-6 py-4 border-b shrink-0">
          <DialogHeader><DialogTitle>Nova Conta a Receber</DialogTitle></DialogHeader>
        </div>
        <div className="space-y-4 p-6 overflow-y-auto flex-1 min-h-0">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Pagamento empresa X" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <div>
              <Label>Categoria *</Label>
              <CategorySelect
                value={form.category_id}
                onChange={(value) => set('category_id', value)}
                valueKey="id"
                allowedTypes={['income']}
                allowNone={false}
                className="mt-1"
                placeholder="Selecionar categoria"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Bruto (R$) *</Label>
              <CurrencyInput value={form.amount} onChange={(value) => set('amount', value)} className="mt-1" />
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
              <Label>Competência</Label>
              <Input type="date" value={form.competencia} onChange={e => set('competencia', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor Líquido</Label>
              <Input value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netAmount)} disabled className="mt-1 bg-muted text-muted-foreground" />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="mt-1" placeholder="Opcional..." rows={3} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Recorrente (mensal)?</Label>
            <Switch checked={form.recurrent} onCheckedChange={v => set('recurrent', v)} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t shrink-0 bg-slate-50 mt-auto">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}