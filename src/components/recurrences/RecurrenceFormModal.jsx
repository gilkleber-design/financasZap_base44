import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';

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

export default function RecurrenceFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    due_day: '',
    category: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [categorySuggestion, setCategorySuggestion] = useState(null);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const { flatForSelect } = useCategories();
  const categories = flatForSelect.length > 0 ? flatForSelect : FALLBACK_CATEGORIES;

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
    const recurrence = await base44.entities.Recurrence.create({
      description: form.description,
      amount: parseFloat(form.amount),
      due_day: day,
      category: form.category,
      notes: form.notes || undefined,
      active: true,
    });
    setSaving(false);
    onSaved(recurrence);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Despesa Recorrente</DialogTitle>
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
          <div>
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={v => { set('category', v); setCategorySuggestion(null); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
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
            Ao salvar, serão gerados automaticamente <strong>12 lançamentos futuros</strong> em Contas a Pagar com status <strong>Pendente</strong>.
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Criar e Gerar Lançamentos'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}