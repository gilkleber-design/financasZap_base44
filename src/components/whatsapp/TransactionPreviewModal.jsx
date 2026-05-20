import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect } from '@/components/ui/category-select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Edit2, Save, Link2, X, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useCategories } from '@/hooks/useCategories';

const INCOME_CATEGORIES = [
  { value: 'salario_clt', label: 'Salário CLT' },
  { value: 'receita_pj', label: 'Receita PJ' },
  { value: 'outros', label: 'Outros' },
];

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Removed hasSimilarity

export default function TransactionPreviewModal({ data, incomeSources, cards = [], accounts = [], onSave, onCancel }) {
  const [form, setForm] = useState({ ...data });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [categorySuggestion, setCategorySuggestion] = useState(null); // { slug, name }
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const suggestionFiredRef = useRef(false);

  const { flatForSelect } = useCategories();
  const expenseCategories = flatForSelect ?? [];

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Sugere categoria via IA quando a categoria não foi preenchida pela IA
  useEffect(() => {
    if (suggestionFiredRef.current) return;
    if (form.type !== 'expense') return;
    if (form.category && form.category !== 'outros') return; // IA já categorizou
    if (!form.description || expenseCategories.length === 0) return;

    suggestionFiredRef.current = true;
    setSuggestingCategory(true);

    const categoryList = expenseCategories.map(c => `${c.label.trim()} (${c.value})`).join(', ');

    base44.integrations.Core.InvokeLLM({
      prompt: `Você é um classificador financeiro. Dado a descrição de uma despesa, escolha a categoria mais adequada da lista abaixo.\n\nDescrição: "${form.description}"\n\nCategorias disponíveis:\n${categoryList}\n\nResponda SOMENTE com o JSON no formato exato: {"slug": "valor_da_categoria", "name": "Nome da Categoria"}. Sem explicações.`,
      response_json_schema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
        },
      },
    }).then(result => {
      if (result?.slug && result.slug !== form.category) {
        setCategorySuggestion(result);
      }
    }).finally(() => setSuggestingCategory(false));
  }, [form.description, form.type, expenseCategories.length]);

  const handleSave = () => {
    if (!paymentMethod) return;
    const finalData = { ...form };
    
    const isAccount = paymentMethod.startsWith('account:');
    const isCard = paymentMethod.startsWith('card:');
    const originId = paymentMethod.split(':')[1];
    
    if (isAccount) finalData.account_id = originId;
    if (isCard) finalData.card_id = originId;
    
    if (paymentMethod) finalData.notes = `${finalData.notes ? finalData.notes + ' | ' : ''}Pagamento/Recebimento: ID ${originId}`;
    onSave(finalData);
  };

  // Monta opções de pagamento com IDs estritos para evitar órfãos de origem
  const paymentOptions = [
    ...accounts.filter(a => a.active !== false).map(a => ({ id: `account:${a.id}`, label: `🏦 Conta - ${a.name}${a.bank ? ` (${a.bank})` : ''}` })),
    ...cards.filter(c => c.active !== false).map(c => ({ id: `card:${c.id}`, label: `💳 Cartão - ${c.name}` }))
  ];

  return (
    <Card className="border-2 border-primary/20 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary" />
            Revisar Lançamento
          </CardTitle>
          <Badge variant={form.confidence > 0.7 ? 'default' : 'destructive'} className="text-xs">
            {form.confidence > 0.7 ? '✓ Alta confiança' : '⚠ Verificar'}
          </Badge>
        </div>
        {form.notes && !form.notes.startsWith('Pagamento:') && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {form.notes}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Alertas de conciliação removidos do fluxo */}

        {/* Sugestão de categoria via IA */}
        {suggestingCategory && form.type === 'expense' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            Sugerindo categoria...
          </div>
        )}
        {categorySuggestion && !suggestingCategory && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-violet-700 font-medium">Categoria sugerida pela IA</p>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Descrição</Label>
            <Input value={form.description || ''} onChange={e => set('description', e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={form.type} onValueChange={v => set('type', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Categoria</Label>
            {form.type === 'expense' ? (
              <CategorySelect value={form.category} onChange={(value) => { set('category', value); setCategorySuggestion(null); }} className="mt-1" />
            ) : (
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {INCOME_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label className="text-xs">Valor Bruto (R$)</Label>
            <CurrencyInput value={form.amount || ''} onChange={(value) => set('amount', parseFloat(value) || 0)} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} className="mt-1" />
          </div>

          {form.type === 'income' && (
            <>
              <div>
                <Label className="text-xs">Alíquota Imposto (%)</Label>
                <Input type="number" value={form.tax_rate || ''} onChange={e => {
                  const rate = parseFloat(e.target.value) || 0;
                  set('tax_rate', rate);
                  set('tax_amount', (form.amount || 0) * rate / 100);
                  set('net_amount', (form.amount || 0) * (1 - rate / 100));
                }} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Valor Líquido (R$)</Label>
                <CurrencyInput value={form.net_amount || form.amount || ''} onChange={(value) => set('net_amount', parseFloat(value) || 0)} className="mt-1" />
              </div>
            </>
          )}
        </div>

        {/* Forma de pagamento */}
        <div>
          <Label className="text-xs">Origem (Conta/Cartão) *</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione a origem de pagamento/recebimento..." />
            </SelectTrigger>
            <SelectContent>
              {paymentOptions.map(opt => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tax summary */}
        {form.type === 'income' && form.tax_amount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium text-amber-700">📊 Resumo Fiscal</p>
            <p className="text-amber-600">Bruto: {fmt(form.amount)} · Imposto ({form.tax_rate}%): {fmt(form.tax_amount)} · Líquido: {fmt(form.net_amount)}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button onClick={handleSave} disabled={!paymentMethod} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Salvar Lançamento
        </Button>
      </CardFooter>
    </Card>
  );
}