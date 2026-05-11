import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';
import { addMonths, format, startOfMonth } from 'date-fns';
import { CreditCard, Landmark, Repeat, Layers, Receipt } from 'lucide-react';

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' }, { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' }, { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' }, { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' }, { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' }, { value: 'outros', label: 'Outros' },
];

const EXPENSE_TYPES = [
  { value: 'avulsa', label: 'Avulsa', icon: Receipt, desc: 'Despesa única, sem repetição' },
  { value: 'parcelada', label: 'Parcelada', icon: Layers, desc: 'Compra dividida em X vezes' },
  { value: 'fixa', label: 'Fixa', icon: Repeat, desc: 'Repete todo mês indefinidamente' },
];

// Gera 13 Payables futuros para uma recorrência
async function generateRecurrencePayables(recurrence, recurrenceId) {
  const now = new Date();
  const payables = [];
  for (let i = 0; i < 13; i++) {
    const targetMonth = addMonths(startOfMonth(now), i);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(recurrence.due_day, maxDay);
    const dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    payables.push({
      description: recurrence.description,
      amount: recurrence.amount,
      due_date: dueDate + 'T12:00:00',
      competencia: dueDate,
      category: recurrence.category,
      status: recurrence.payment_modality === 'automatic_debit' ? 'scheduled' : 'pending',
      recurrent: true,
      recurrence_id: recurrenceId,
      origin_id: recurrence.origin_id || undefined,
      origin_type: recurrence.origin_type || undefined,
      payment_modality: recurrence.payment_modality || 'manual',
    });
  }
  await base44.entities.Payable.bulkCreate(payables);
}

export default function ExpenseFormModal({ onClose, onSaved }) {
  const [expenseType, setExpenseType] = useState('avulsa');
  const [form, setForm] = useState({
    description: '', amount: '', due_date: '', category: '', notes: '',
    origin_id: '', origin_type: '', payment_modality: 'manual',
    // Parcelada
    installment_total_amount: '', installment_count: '', installment_number: '1',
    // Fixa
    due_day: '',
  });
  const [saving, setSaving] = useState(false);
  const { origins } = usePaymentOrigins();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleOriginChange = (value) => {
    const origin = origins.find(o => o.id === value);
    if (!origin) { set('origin_id', ''); set('origin_type', ''); return; }
    set('origin_id', origin.id);
    set('origin_type', origin.type);
    if (origin.type === 'card') set('payment_modality', 'card_invoice');
    else if (form.payment_modality === 'card_invoice') set('payment_modality', 'manual');
  };

  const selectedOrigin = origins.find(o => o.id === form.origin_id);
  const isCard = selectedOrigin?.type === 'card';
  const isAccount = selectedOrigin?.type === 'account';

  const handleSave = async () => {
    if (!form.description || !form.amount) return toast.error('Preencha descrição e valor');

    setSaving(true);

    if (expenseType === 'fixa') {
      if (!form.due_day) { setSaving(false); return toast.error('Informe o dia de vencimento'); }
      // Cria Recorrência
      const rec = await base44.entities.Recurrence.create({
        description: form.description,
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day),
        category: form.category || 'outros',
        active: true,
        origin_id: form.origin_id || undefined,
        origin_type: form.origin_type || undefined,
        payment_modality: form.payment_modality,
        notes: form.notes || undefined,
      });
      // Gera 13 meses de Payables vinculados
      await generateRecurrencePayables({
        description: form.description,
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day),
        category: form.category || 'outros',
        origin_id: form.origin_id || undefined,
        origin_type: form.origin_type || undefined,
        payment_modality: form.payment_modality,
      }, rec.id);
      toast.success('Despesa fixa criada! 13 meses gerados.');

    } else if (expenseType === 'parcelada') {
      if (!form.due_date) { setSaving(false); return toast.error('Informe a data da 1ª parcela'); }
      const total = parseFloat(form.installment_total_amount || form.amount);
      const count = parseInt(form.installment_count) || 1;
      const startNum = parseInt(form.installment_number) || 1;
      const installAmt = Math.round((total / count) * 100) / 100;
      const groupId = genId();
      const baseDate = new Date(form.due_date + 'T12:00:00');
      const payables = [];
      for (let i = 0; i < (count - startNum + 1); i++) {
        const d = addMonths(baseDate, i);
        const ds = format(d, 'yyyy-MM-dd');
        payables.push({
          description: `${form.description} (${startNum + i}/${count})`,
          amount: installAmt,
          due_date: ds + 'T12:00:00',
          competencia: ds,
          category: form.category || undefined,
          status: 'pending',
          recurrent: false,
          origin_id: form.origin_id || undefined,
          origin_type: form.origin_type || undefined,
          payment_modality: form.payment_modality,
          installment_total_amount: total,
          installment_count: count,
          installment_number: startNum + i,
          installment_group_id: groupId,
          notes: form.notes || undefined,
        });
      }
      await base44.entities.Payable.bulkCreate(payables);
      toast.success(`${payables.length} parcelas criadas!`);

    } else {
      // Avulsa
      if (!form.due_date) { setSaving(false); return toast.error('Informe o vencimento'); }
      await base44.entities.Payable.create({
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date + 'T12:00:00',
        competencia: form.due_date,
        category: form.category || undefined,
        status: form.payment_modality === 'automatic_debit' ? 'scheduled' : 'pending',
        recurrent: false,
        origin_id: form.origin_id || undefined,
        origin_type: form.origin_type || undefined,
        payment_modality: form.payment_modality,
        notes: form.notes || undefined,
      });
      toast.success('Despesa criada!');
    }

    setSaving(false);
    onSaved();
  };

  const installmentsToGenerate = expenseType === 'parcelada' && form.installment_count && form.installment_number
    ? parseInt(form.installment_count) - parseInt(form.installment_number) + 1
    : 0;
  const installmentAmt = expenseType === 'parcelada' && form.installment_total_amount && form.installment_count
    ? (parseFloat(form.installment_total_amount) / parseInt(form.installment_count)).toFixed(2)
    : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Despesa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">

          {/* Tipo de despesa */}
          <div>
            <Label className="mb-2 block">Tipo de Despesa</Label>
            <div className="grid grid-cols-3 gap-2">
              {EXPENSE_TYPES.map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  onClick={() => setExpenseType(value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                    expenseType === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Aluguel, Netflix, iPhone..." />
          </div>

          {/* Origem do Pagamento */}
          <div>
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id || '_none'} onValueChange={handleOriginChange}>
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
            {isCard && <p className="text-xs text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded">💳 Provisionado na fatura deste cartão</p>}
          </div>

          {/* Modalidade — só para conta corrente */}
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
                <p className="text-xs text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">⚡ Baixado automaticamente no vencimento</p>
              )}
            </div>
          )}

          {/* Valor */}
          <div className={`grid gap-3 ${expenseType === 'avulsa' || expenseType === 'parcelada' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <Label>{expenseType === 'parcelada' ? 'Valor da Parcela (R$) *' : 'Valor (R$) *'}</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
            </div>
            {(expenseType === 'avulsa') && (
              <div>
                <Label>Vencimento *</Label>
                <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
              </div>
            )}
            {expenseType === 'fixa' && (
              <div>
                <Label>Dia do Vencimento *</Label>
                <Input type="number" min={1} max={31} value={form.due_day} onChange={e => set('due_day', e.target.value)} className="mt-1" placeholder="Ex: 10" />
              </div>
            )}
          </div>

          {/* Campos extras para Parcelada */}
          {expenseType === 'parcelada' && (
            <div className="border border-border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Detalhes do Parcelamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor Total da Compra</Label>
                  <Input type="number" value={form.installment_total_amount} onChange={e => set('installment_total_amount', e.target.value)} className="mt-1 text-sm" placeholder="R$ 0,00" />
                </div>
                <div>
                  <Label className="text-xs">Data da 1ª Parcela *</Label>
                  <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Total de Parcelas</Label>
                  <Input type="number" min={1} value={form.installment_count} onChange={e => set('installment_count', e.target.value)} className="mt-1 text-sm" placeholder="12" />
                </div>
                <div>
                  <Label className="text-xs">Parcela Atual</Label>
                  <Input type="number" min={1} value={form.installment_number} onChange={e => set('installment_number', e.target.value)} className="mt-1 text-sm" placeholder="1" />
                </div>
              </div>
              {installmentsToGenerate > 0 && installmentAmt && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                  Serão geradas <strong>{installmentsToGenerate}</strong> parcelas de <strong>R$ {installmentAmt}</strong>
                </p>
              )}
            </div>
          )}

          {/* Categoria */}
          <div>
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : expenseType === 'parcelada' ? 'Gerar Parcelas' : expenseType === 'fixa' ? 'Criar Despesa Fixa' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}