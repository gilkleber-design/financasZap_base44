import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect } from '@/components/ui/category-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { toast } from 'sonner';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';
import { useCategories } from '@/hooks/useCategories';
import { format, addMonths } from 'date-fns';

const getTodayString = () => {
  const now = new Date();
  return format(now, 'yyyy-MM-dd');
};
import { Landmark, Repeat, Layers, Receipt } from 'lucide-react';

const EXPENSE_TYPES = [
  { value: 'avulsa', label: 'Avulsa', icon: Receipt, desc: 'Despesa única, sem repetição' },
  { value: 'parcelada', label: 'Parcelada', icon: Layers, desc: 'Compra dividida em X vezes' },
  { value: 'fixa', label: 'Fixa', icon: Repeat, desc: 'Repete todo mês indefinidamente' },
];

export default function ExpenseFormModal({ onClose, onSaved }) {
  const [expenseType, setExpenseType] = useState('avulsa');
  const [form, setForm] = useState({
    description: '', amount: '', due_date: getTodayString(), category: '', notes: '',
    origin_id: '', origin_type: '', payment_modality: 'manual', payment_date: '',
    // Parcelada
    installment_total_amount: '', installment_count: '', installment_number: '1',
    // Fixa
    due_day: '',
  });
  const [saving, setSaving] = useState(false);
  const { origins } = usePaymentOrigins();
  const { categories: allCategories } = useCategories();
  
  // Map slug -> id para categorias do banco
  const getCategoryId = (slug) => {
    const cat = allCategories.find(c => c.slug === slug);
    return cat?.id || undefined;
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleOriginChange = (value) => {
    const accountOrigin = origins.find(o => o.id === value && o.type === 'account');
    const cardOrigin = origins.find(o => o.id === value && o.type === 'card');
    if (accountOrigin) {
      set('origin_id', accountOrigin.id);
      set('origin_type', 'account');
    } else if (cardOrigin) {
      set('origin_id', cardOrigin.id);
      set('origin_type', 'card');
    } else {
      set('origin_id', '');
      set('origin_type', '');
    }
  };

  const selectedOrigin = origins.find(o => o.id === form.origin_id && (o.type === 'account' || o.type === 'card'));
  const isAccount = selectedOrigin?.type === 'account';

  const handleSave = async () => {
    try {
      const validationErrors = [];
      if (!form.description?.trim()) validationErrors.push('descrição');
      if (!form.amount || parseFloat(form.amount) <= 0) validationErrors.push('valor válido');
      if (expenseType !== 'fixa' && !form.due_date) validationErrors.push('data de vencimento');
      if (expenseType === 'fixa' && !form.due_day) validationErrors.push('dia de vencimento');
      if (form.payment_date && !form.origin_id) validationErrors.push('origem do pagamento');

      if (validationErrors.length > 0) {
        return toast.error(`Preencha: ${validationErrors.join(', ')}`);
      }

      if (allCategories.length === 0) return toast.error('Categorias carregando... tente novamente');

      setSaving(true);
      await base44.functions.invoke('createPayable', {
        expense_type: expenseType,
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        competencia: form.due_date,
        due_day: form.due_day ? parseInt(form.due_day) : undefined,
        category: form.category || 'outros',
        category_id: getCategoryId(form.category),
        origin_id: form.origin_id || undefined,
        origin_type: form.origin_type || undefined,
        payment_modality: form.payment_modality,
        payment_date: form.payment_date || undefined,
        installment_total_amount: form.installment_total_amount ? parseFloat(form.installment_total_amount) : undefined,
        installment_count: form.installment_count ? parseInt(form.installment_count) : undefined,
        installment_number: form.installment_number ? parseInt(form.installment_number) : undefined,
        notes: form.notes || undefined,
      });

      toast.success(expenseType === 'fixa' ? 'Despesa fixa salva.' : 'Despesa criada com sucesso.');
      setSaving(false);
      onSaved();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setSaving(false);
      toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido'));
    }
  };

  const installmentsToGenerate = expenseType === 'parcelada' && form.installment_count && form.installment_number
    ? parseInt(form.installment_count) - parseInt(form.installment_number) + 1
    : 0;
  const installmentAmt = expenseType === 'parcelada' && form.installment_count
    ? (form.installment_total_amount ? parseFloat(form.installment_total_amount) / parseInt(form.installment_count) : parseFloat(form.amount || 0))
    : null;
  const firstGeneratedDate = expenseType === 'parcelada' && form.due_date && form.installment_number
    ? format(addMonths(new Date(form.due_date + 'T12:00:00'), parseInt(form.installment_number) - 1), 'dd/MM/yyyy')
    : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Despesa</DialogTitle>
          <DialogDescription>Preencha os detalhes da despesa</DialogDescription>
        </DialogHeader>
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
            <Input tabIndex={1} value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Aluguel, Netflix, iPhone..." />
          </div>

          {/* Categoria */}
          <div>
            <Label>Categoria</Label>
            <CategorySelect
              value={form.category}
              onChange={(value) => set('category', value)}
              allowedTypes={['expense', 'transfer']}
              className="mt-1"
            />
          </div>

          {/* Origem do Pagamento */}
          <div>
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id || '_none'} onValueChange={handleOriginChange}>
              <SelectTrigger tabIndex={3} className="mt-1">
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
                      💳 Cartões de Crédito
                    </div>
                    {origins.filter(o => o.type === 'card').map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Modalidade — só para conta corrente */}
          {isAccount && (
            <div>
              <Label>Modalidade</Label>
              <Select value={form.payment_modality} onValueChange={v => set('payment_modality', v)}>
                <SelectTrigger tabIndex={4} className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic_debit">Débito Automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}



          {/* Valor */}
          <div className={`grid gap-3 ${expenseType === 'avulsa' || expenseType === 'parcelada' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <Label>{expenseType === 'parcelada' ? 'Valor da Parcela (R$) *' : 'Valor (R$) *'}</Label>
              <CurrencyInput tabIndex={6} value={form.amount} onChange={(value) => set('amount', value)} className="mt-1" />
            </div>
            {(expenseType === 'avulsa') && (
              <div>
                <Label>Vencimento *</Label>
                <Input tabIndex={6} type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
              </div>
            )}
            {expenseType === 'fixa' && (
              <div>
                <Label>Dia do Vencimento *</Label>
                <Input tabIndex={6} type="number" min={1} max={31} value={form.due_day} onChange={e => set('due_day', e.target.value)} className="mt-1" placeholder="Ex: 10" />
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
                  <CurrencyInput tabIndex={7} value={form.installment_total_amount} onChange={(value) => set('installment_total_amount', value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Data da 1ª Parcela *</Label>
                  <Input tabIndex={8} type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Total de Parcelas</Label>
                  <Input tabIndex={9} type="number" min={1} value={form.installment_count} onChange={e => set('installment_count', e.target.value)} className="mt-1 text-sm" placeholder="12" />
                </div>
                <div>
                  <Label className="text-xs">Parcela Atual</Label>
                  <Input tabIndex={10} type="number" min={1} value={form.installment_number} onChange={e => set('installment_number', e.target.value)} className="mt-1 text-sm" placeholder="1" />
                </div>
              </div>
              {installmentsToGenerate > 0 && installmentAmt > 0 && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 leading-relaxed">
                  Serão geradas <strong>{installmentsToGenerate}</strong> parcelas de <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(installmentAmt)}</strong>.<br />
                  A parcela {form.installment_number}/{form.installment_count} terá vencimento em <strong>{firstGeneratedDate}</strong>.
                </p>
              )}
            </div>
          )}

          {/* Observação */}
          <div>
            <Label>Observação</Label>
            <Input tabIndex={5} value={form.notes} onChange={e => set('notes', e.target.value)} className="mt-1" placeholder="Opcional..." />
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