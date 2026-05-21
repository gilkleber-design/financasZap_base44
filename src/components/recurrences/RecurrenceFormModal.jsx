import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect } from '@/components/ui/category-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sparkles, Loader2, X, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';
import { Checkbox } from '@/components/ui/checkbox';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';

export default function RecurrenceFormModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: initial?.description || '',
    amount: initial?.amount || '',
    due_day: initial?.due_day || '',
    category: initial?.category || '',
    notes: initial?.notes || '',
    origin_id: initial?.origin_id || '',
    origin_type: initial?.origin_type || '',
    payment_modality: initial?.payment_modality || 'manual',
  });
  const [saving, setSaving] = useState(false);
  const [categorySuggestion, setCategorySuggestion] = useState(null);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const { flatForSelect } = useCategories();
  const categories = flatForSelect.filter(category => ['expense', 'transfer'].includes(category.type || 'expense'));
  const { origins } = usePaymentOrigins();
  const queryClient = useQueryClient();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Sugere categoria ao sair do campo Descrição
  const handleDescriptionBlur = async () => {
    if (!form.description || form.category) return;
    if (categories.length === 0) return;

    setSuggestingCategory(true);
    const categoryList = categories.map(c => `${c.label} (${c.value})`).join(', ');

    base44.integrations.Core.InvokeLLM({
      prompt: `Classifique esta despesa recorrente em uma das categorias abaixo.\n\nDescrição: "${form.description}"\n\nCategorias: ${categoryList}\n\nResponda APENAS com JSON: {"slug": "valor", "name": "Nome"}`,
      response_json_schema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
        },
      },
    }).then(result => {
      if (result?.slug) setCategorySuggestion(result);
    }).finally(() => setSuggestingCategory(false));
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_day || !form.category) {
      return toast.error('Preencha todos os campos obrigatórios');
    }
    const day = parseInt(form.due_day);
    if (day < 1 || day > 31) return toast.error('Dia de vencimento inválido (1-31)');

    setSaving(true);
    const extraFields = {
      origin_id: form.origin_id || undefined,
      origin_type: form.origin_type || undefined,
      payment_modality: form.payment_modality || 'manual',
    };

    if (initial) {
      const updated = await base44.entities.Recurrence.update(initial.id, {
        description: form.description,
        amount: parseFloat(form.amount),
        due_day: day,
        category: form.category,
        notes: form.notes || undefined,
        ...extraFields,
      });
      setSaving(false);
      onSaved(updated);
    } else {
      const recurrence = await base44.entities.Recurrence.create({
        description: form.description,
        amount: parseFloat(form.amount),
        due_day: day,
        category: form.category,
        notes: form.notes || undefined,
        active: true,
        ...extraFields,
      });
      setSaving(false);
      onSaved(recurrence);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Despesa Recorrente' : 'Nova Despesa Recorrente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {suggestingCategory && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              Sugerindo categoria...
            </div>
          )}
          {categorySuggestion && !suggestingCategory && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-violet-700 font-medium">Categoria sugerida</p>
                <p className="text-sm font-semibold text-violet-900">{categorySuggestion.name}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => { set('category', categorySuggestion.slug); setCategorySuggestion(null); }}>
                  Usar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setCategorySuggestion(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
          <div>
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              onBlur={handleDescriptionBlur}
              className="mt-1"
              placeholder="Ex: Aluguel, Netflix, Condomínio"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Mensal (R$) *</Label>
              <CurrencyInput
                value={form.amount}
                onChange={(value) => set('amount', value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Dia do Vencimento *</Label>
              <Input
                type="number"
                value={form.due_day}
                onChange={e => set('due_day', e.target.value)}
                className="mt-1"
                placeholder="Ex: 5, 10, 15"
                min={1}
                max={31}
              />
            </div>
          </div>
          {/* Origem do pagamento */}
          <div>
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id || '_none'} onValueChange={(value) => {
              if (value === '_none') {
                set('origin_id', '');
                set('origin_type', '');
                return;
              }
              const origin = origins.find(o => o.id === value);
              if (!origin) return;
              set('origin_id', origin.id);
              set('origin_type', origin.type);
            }}>
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
                      💳 Cartões de Crédito
                    </div>
                    {origins.filter(o => o.type === 'card').map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {form.origin_type === 'account' && (
              <div className="mt-2">
                <Label>Modalidade</Label>
                <Select value={form.payment_modality} onValueChange={v => set('payment_modality', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic_debit">Débito Automático</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Categoria *</Label>
            <CategorySelect
              value={form.category}
              onChange={(value) => { set('category', value); setCategorySuggestion(null); }}
              allowedTypes={['expense', 'transfer']}
              className="mt-1"
              allowNone={false}
            />
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

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            Ao salvar, será criado apenas o molde da despesa fixa. Os lançamentos reais serão materializados no mês correto.
          </div>
        </div>

        <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : initial ? 'Atualizar' : 'Criar Despesa Fixa'}
        </Button>
        </div>
      </DialogContent>

    </Dialog>
  );
}