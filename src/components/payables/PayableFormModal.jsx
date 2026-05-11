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
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';
import { addMonths, format } from 'date-fns';
import { CreditCard, Landmark, Layers } from 'lucide-react';

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const FALLBACK_CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' }, { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' }, { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' }, { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' }, { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' }, { value: 'outros', label: 'Outros' },
];

export default function PayableFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', due_date: '', competencia: '',
    category: '', recurrent: false, notes: '',
    origin_id: '', origin_type: '',
    payment_modality: 'manual',
    // Parcelamento
    is_installment: false,
    installment_total_amount: '',
    installment_count: '',
    installment_number: '1',
  });
  const [saving, setSaving] = useState(false);
  const { flatForSelect } = useCategories();
  const { origins } = usePaymentOrigins();
  const categories = flatForSelect.length > 0 ? flatForSelect : FALLBACK_CATEGORIES;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleOriginChange = (value) => {
    const origin = origins.find(o => o.id === value);
    if (!origin) return;
    set('origin_id', origin.id);
    set('origin_type', origin.type);
    if (origin.type === 'card') {
      set('payment_modality', 'card_invoice');
    } else if (form.payment_modality === 'card_invoice') {
      set('payment_modality', 'manual');
    }
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) {
      return toast.error('Preencha os campos obrigatórios');
    }

    setSaving(true);

    if (form.is_installment) {
      // Parcelamento: gera N payables
      const total = parseFloat(form.installment_total_amount || form.amount);
      const count = parseInt(form.installment_count) || 1;
      const startNumber = parseInt(form.installment_number) || 1;
      const installmentAmount = total / count;
      const groupId = genId();
      const baseDate = new Date(form.due_date + 'T12:00:00');

      const payables = [];
      for (let i = 0; i < (count - startNumber + 1); i++) {
        const dueDate = addMonths(baseDate, i);
        const dueDateStr = format(dueDate, 'yyyy-MM-dd');
        payables.push({
          description: `${form.description} (${startNumber + i}/${count})`,
          amount: Math.round(installmentAmount * 100) / 100,
          due_date: dueDateStr + 'T12:00:00',
          competencia: dueDateStr,
          category: form.category || undefined,
          status: 'pending',
          recurrent: false,
          origin_id: form.origin_id || undefined,
          origin_type: form.origin_type || undefined,
          payment_modality: form.payment_modality,
          installment_total_amount: total,
          installment_count: count,
          installment_number: startNumber + i,
          installment_group_id: groupId,
          notes: form.notes || undefined,
        });
      }
      await base44.entities.Payable.bulkCreate(payables);
      toast.success(`${payables.length} parcelas criadas!`);
    } else {
      // Lançamento único
      const isAutoDebit = form.payment_modality === 'automatic_debit';
      await base44.entities.Payable.create({
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date + 'T12:00:00',
        competencia: form.competencia || form.due_date,
        category: form.category || undefined,
        status: isAutoDebit ? 'scheduled' : 'pending',
        recurrent: form.recurrent,
        origin_id: form.origin_id || undefined,
        origin_type: form.origin_type || undefined,
        payment_modality: form.payment_modality,
        notes: form.notes || undefined,
      });
      toast.success('Conta a pagar criada!');
    }

    setSaving(false);
    onSaved();
  };

  const selectedOrigin = origins.find(o => o.id === form.origin_id);
  const isCard = selectedOrigin?.type === 'card';
  const isAccount = selectedOrigin?.type === 'account';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">

          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Aluguel, Netflix..." />
          </div>

          {/* Origem do Pagamento */}
          <div>
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id} onValueChange={handleOriginChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar conta ou cartão..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Nenhuma —</SelectItem>
                {origins.filter(o => o.type === 'account').length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Landmark className="w-3 h-3" /> Contas Correntes
                    </div>
                    {origins.filter(o => o.type === 'account').map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
                {origins.filter(o => o.type === 'card').length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" /> Cartões de Crédito
                    </div>
                    {origins.filter(o => o.type === 'card').map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {isCard && (
              <p className="text-xs text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded">
                💳 Gasto será provisionado na fatura deste cartão
              </p>
            )}
          </div>

          {/* Modalidade — só mostra se for conta corrente */}
          {isAccount && (
            <div>
              <Label>Modalidade</Label>
              <Select value={form.payment_modality} onValueChange={v => set('payment_modality', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic_debit">Débito Automático</SelectItem>
                </SelectContent>
              </Select>
              {form.payment_modality === 'automatic_debit' && (
                <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">
                  ⚡ Lançamento nasce como "Agendado" — baixado automaticamente no vencimento
                </p>
              )}
            </div>
          )}

          {/* Valor e Vencimento */}
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
            <Input type="date" value={form.competencia} onChange={e => set('competencia', e.target.value)} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Se não preenchido, usa a data de vencimento</p>
          </div>

          {/* Parcelamento */}
          <div className="border border-border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Layers className="w-4 h-4 text-primary" />
                Compra Parcelada
              </Label>
              <Switch checked={form.is_installment} onCheckedChange={v => set('is_installment', v)} />
            </div>
            {form.is_installment && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <Label className="text-xs">Valor Total</Label>
                  <Input type="number" value={form.installment_total_amount} onChange={e => set('installment_total_amount', e.target.value)} className="mt-1 text-sm" placeholder="R$ 0,00" />
                </div>
                <div>
                  <Label className="text-xs">Nº Parcelas</Label>
                  <Input type="number" min={1} value={form.installment_count} onChange={e => set('installment_count', e.target.value)} className="mt-1 text-sm" placeholder="12" />
                </div>
                <div>
                  <Label className="text-xs">Parcela Atual</Label>
                  <Input type="number" min={1} value={form.installment_number} onChange={e => set('installment_number', e.target.value)} className="mt-1 text-sm" placeholder="1" />
                </div>
              </div>
            )}
            {form.is_installment && form.installment_count && form.installment_number && form.installment_total_amount && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                Serão geradas <strong>{parseInt(form.installment_count) - parseInt(form.installment_number) + 1}</strong> parcelas de{' '}
                <strong>R$ {(parseFloat(form.installment_total_amount) / parseInt(form.installment_count)).toFixed(2)}</strong> a partir de {form.due_date || '—'}
              </p>
            )}
          </div>

          {!form.is_installment && (
            <div className="flex items-center justify-between">
              <Label>Recorrente (mensal)?</Label>
              <Switch checked={form.recurrent} onCheckedChange={v => set('recurrent', v)} />
            </div>
          )}

        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : form.is_installment ? 'Gerar Parcelas' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}