import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Edit2, Save } from 'lucide-react';

const CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'salario_clt', label: 'Salário CLT' },
  { value: 'receita_pj', label: 'Receita PJ' },
  { value: 'outros', label: 'Outros' },
];

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function TransactionPreviewModal({ data, incomeSources, payables, receivables, onSave, onCancel }) {
  const [form, setForm] = useState({ ...data });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const reconcileLabel = () => {
    if (form.payable_id) {
      const p = payables.find(p => p.id === form.payable_id);
      return p ? `Quita: ${p.description}` : null;
    }
    if (form.receivable_id) {
      const r = receivables.find(r => r.id === form.receivable_id);
      return r ? `Concilia: ${r.description}` : null;
    }
    return null;
  };

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
        {form.notes && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {form.notes}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
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
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Valor Bruto (R$)</Label>
            <Input type="number" value={form.amount || ''} onChange={e => set('amount', parseFloat(e.target.value))} className="mt-1" />
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
                <Input type="number" value={form.net_amount || form.amount || ''} onChange={e => set('net_amount', parseFloat(e.target.value))} className="mt-1" />
              </div>
            </>
          )}
        </div>

        {/* Conciliação */}
        {(form.payable_id || form.receivable_id) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-emerald-700">Conciliação Automática</p>
              <p className="text-xs text-emerald-600">{reconcileLabel()}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto text-xs h-6" onClick={() => { set('payable_id', null); set('receivable_id', null); set('reconciled', false); }}>
              Remover
            </Button>
          </div>
        )}

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
        <Button onClick={() => onSave(form)} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Salvar Lançamento
        </Button>
      </CardFooter>
    </Card>
  );
}