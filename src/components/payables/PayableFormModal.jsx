import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getFifthBusinessDay } from '@/lib/businessDayCalculator';

const CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' }, { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' }, { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' }, { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' }, { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' }, { value: 'outros', label: 'Outros' },
];

export default function PayableFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ description: '', amount: '', due_date: '', category: '', recurrent: false, fifth_business_day: false, notes: '' });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleFifthBusinessDayToggle = (checked) => {
    set('fifth_business_day', checked);
    if (checked) {
      const dateToUse = form.due_date || new Date().toISOString().split('T')[0];
      const fifthDay = getFifthBusinessDay(dateToUse);
      set('due_date', fifthDay);
    }
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) return toast.error('Preencha os campos obrigatórios');
    setSaving(true);
    await base44.entities.Payable.create({ ...form, amount: parseFloat(form.amount), status: 'pending' });
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
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Recorrente (mensal)?</Label>
            <Switch checked={form.recurrent} onCheckedChange={v => set('recurrent', v)} />
          </div>
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-3">
            <Checkbox
              checked={form.fifth_business_day}
              onCheckedChange={handleFifthBusinessDayToggle}
              id="fifth-business-day"
            />
            <label
              htmlFor="fifth-business-day"
              className="text-sm font-medium text-blue-900 cursor-pointer flex-1"
            >
              Vencimento no 5º dia útil
            </label>
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