import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';

const FALLBACK_CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' }, { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' }, { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' }, { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' }, { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' }, { value: 'outros', label: 'Outros' },
];

export default function PayableFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ description: '', amount: '', due_date: '', competencia: '', category: '', recurrent: false, notes: '' });
  const [saving, setSaving] = useState(false);
  const { flatForSelect } = useCategories();
  const categories = flatForSelect.length > 0 ? flatForSelect : FALLBACK_CATEGORIES;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);
    await base44.entities.Payable.create({ 
      ...form, 
      due_date: form.due_date + 'T12:00:00',
      competencia: form.competencia || form.due_date,
      amount: parseFloat(form.amount), 
      status: 'pending' 
    });
    setSaving(false);
    toast.success('Conta a pagar criada!');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Aluguel, Conta de luz..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Competência (opcional)</Label>
            <Input type="date" value={form.competencia} onChange={e => set('competencia', e.target.value)} className="mt-1" placeholder="Padrão: data de vencimento" />
            <p className="text-xs text-muted-foreground mt-1">Se não preenchido, usa a data de vencimento</p>
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