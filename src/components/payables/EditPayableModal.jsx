import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getFifthBusinessDay } from '@/lib/businessDayCalculator';

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros',
};

export default function EditPayableModal({ payable, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: payable?.description || '',
    amount: payable?.amount || '',
    due_date: payable?.due_date || '',
    competencia: payable?.competencia || '',
    category: payable?.category || '',
    fifth_business_day: payable?.fifth_business_day || false,
    notes: payable?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [updateScope, setUpdateScope] = useState(null);
  const queryClient = useQueryClient();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleFifthBusinessDayToggle = (checked) => {
    set('fifth_business_day', checked);
    if (checked && form.due_date) {
      const fifthDay = getFifthBusinessDay(form.due_date);
      set('due_date', fifthDay);
    }
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) {
      return toast.error('Preencha todos os campos obrigatórios');
    }

    setSaving(true);

    const competencia = form.competencia || form.due_date;

    if (updateScope === 'this') {
      await base44.entities.Payable.update(payable.id, {
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        competencia,
        category: form.category,
        fifth_business_day: form.fifth_business_day,
        notes: form.notes || undefined,
      });
    } else if (updateScope === 'all') {
      const allPayables = await base44.entities.Payable.list('-due_date', 500);
      const toUpdate = allPayables.filter(p => p.description === payable.description);
      for (const p of toUpdate) {
        await base44.entities.Payable.update(p.id, {
          description: form.description,
          amount: parseFloat(form.amount),
          competencia: form.competencia || p.due_date,
          category: form.category,
          fifth_business_day: form.fifth_business_day,
          notes: form.notes || undefined,
        });
      }
    } else if (updateScope === 'forward') {
      const allPayables = await base44.entities.Payable.list('-due_date', 500);
      const toUpdate = allPayables.filter(
        p => p.description === payable.description && new Date(p.due_date) >= new Date(payable.due_date)
      );
      for (const p of toUpdate) {
        await base44.entities.Payable.update(p.id, {
          description: form.description,
          amount: parseFloat(form.amount),
          competencia: form.competencia || p.due_date,
          category: form.category,
          fifth_business_day: form.fifth_business_day,
          notes: form.notes || undefined,
        });
      }
    }

    setSaving(false);
    await queryClient.invalidateQueries();
    onSaved();
  };

  if (updateScope) {
    return (
      <AlertDialog open onOpenChange={() => setUpdateScope(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar atualização</AlertDialogTitle>
            <AlertDialogDescription>
              {updateScope === 'this' && 'Vai atualizar apenas este lançamento de "' + payable.description + '"'}
              {updateScope === 'all' && 'Vai atualizar TODAS as parcelas de "' + payable.description + '"'}
              {updateScope === 'forward' && 'Vai atualizar este e todos os lançamentos futuros de "' + payable.description + '"'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Atualizando...' : 'Confirmar'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Conta a Pagar</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Data de Vencimento *</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Competência (opcional)</Label>
            <Input
              type="date"
              value={form.competencia}
              onChange={e => set('competencia', e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Se não preenchido, usa a data de vencimento</p>
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

          <div>
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="mt-1"
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={() => setUpdateScope('this')} disabled={saving} className="flex-1">
            Salvar
          </Button>
        </div>

        <div className="text-xs text-muted-foreground pt-2 space-y-1">
          <p className="font-medium">Outras opções:</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left text-xs h-auto py-1"
            onClick={() => setUpdateScope('forward')}
            disabled={saving}
          >
            Atualizar este e futuros
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left text-xs h-auto py-1"
            onClick={() => setUpdateScope('all')}
            disabled={saving}
          >
            Atualizar todas as parcelas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}