import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, X, Plus, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';
import { Checkbox } from '@/components/ui/checkbox';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';

const FALLBACK_CATEGORIES = [
  { value: 'moradia', label: 'Moradia' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'outros', label: 'Outros' },
];

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
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const { flatForSelect } = useCategories();
  const categories = flatForSelect.length > 0 ? flatForSelect : FALLBACK_CATEGORIES;
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
              <Input
                type="number"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="mt-1"
                placeholder="0,00"
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
            <Select value={form.origin_id} onValueChange={(value) => {
              const origin = origins.find(o => o.id === value);
              if (!origin || origin.type !== 'account') { set('origin_id', ''); set('origin_type', ''); return; }
              set('origin_id', origin.id);
              set('origin_type', 'account');
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
            <Select value={form.category} onValueChange={v => {
              if (v === '__new_category__') {
                setShowNewCategoryForm(true);
              } else {
                set('category', v);
                setCategorySuggestion(null);
              }
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
                <SelectItem value="__new_category__" className="border-t pt-2">
                  <Plus className="w-4 h-4 mr-2 inline" /> Nova categoria
                </SelectItem>
              </SelectContent>
            </Select>
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

      {showNewCategoryForm && (
        <NewCategoryFormModal
          onClose={() => setShowNewCategoryForm(false)}
          onSaved={(newCategory) => {
            set('category', newCategory.slug);
            queryClient.invalidateQueries(['categories']);
            setShowNewCategoryForm(false);
          }}
        />
      )}
    </Dialog>
  );
}

function NewCategoryFormModal({ onClose, onSaved }) {
  const [newCatForm, setNewCatForm] = useState({ name: '', slug: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);

  const autoSlug = (name) => name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const handleSave = async () => {
    if (!newCatForm.name || !newCatForm.slug) {
      toast.error('Nome e slug são obrigatórios');
      return;
    }
    setSaving(true);
    const category = await base44.entities.Category.create({
      name: newCatForm.name,
      slug: newCatForm.slug,
      color: newCatForm.color,
      active: true,
    });
    setSaving(false);
    onSaved(category);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome *</Label>
            <Input
              value={newCatForm.name}
              onChange={e => {
                setNewCatForm(p => ({ ...p, name: e.target.value, slug: autoSlug(e.target.value) }));
              }}
              className="mt-1"
              placeholder="Ex: Streaming"
            />
          </div>
          <div>
            <Label>Identificador (slug)</Label>
            <Input
              value={newCatForm.slug}
              onChange={e => setNewCatForm(p => ({ ...p, slug: e.target.value }))}
              className="mt-1 font-mono text-xs"
              placeholder="streaming"
            />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'].map(c => (
                <button
                  key={c}
                  onClick={() => setNewCatForm(p => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-full transition-all ${newCatForm.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}