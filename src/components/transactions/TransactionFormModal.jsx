import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LinkIcon, AlertCircle } from 'lucide-react';

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

// Verifica se dois textos têm similaridade por palavras em comum
function hasSimilarity(a, b) {
  if (!a || !b) return false;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  return wordsA.some(w => wordsB.includes(w));
}

export default function TransactionFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', net_amount: '', type: 'expense',
    category: '', date: format(new Date(), 'yyyy-MM-dd'), tax_rate: '', member: 'eu', source: 'manual',
  });
  const [saving, setSaving] = useState(false);
  const [matchSuggestion, setMatchSuggestion] = useState(null); // { item, entityType }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 100),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 100),
  });

  const findMatch = (description, type) => {
    if (type === 'income') {
      const match = receivables.find(r => r.status === 'pending' && hasSimilarity(description, r.description));
      if (match) return { item: match, entityType: 'receivable' };
    } else {
      const match = payables.find(p => p.status === 'pending' && hasSimilarity(description, p.description));
      if (match) return { item: match, entityType: 'payable' };
    }
    return null;
  };

  const handleSave = async (reconcileWith = null) => {
    if (!form.description || !form.amount || !form.date) return toast.error('Preencha os campos obrigatórios');

    // Se ainda não verificou sugestões, faz a checagem agora
    if (matchSuggestion === undefined) return;
    if (matchSuggestion === null) {
      const match = findMatch(form.description, form.type);
      if (match) {
        setMatchSuggestion(match);
        return; // Pausa para mostrar sugestão
      }
    }

    setSaving(true);
    const taxRate = parseFloat(form.tax_rate) || 0;
    const amount = parseFloat(form.amount);
    const netAmount = form.type === 'income' && taxRate > 0 ? amount * (1 - taxRate / 100) : amount;

    const txData = {
      ...form, amount, net_amount: parseFloat(form.net_amount) || netAmount,
      tax_rate: taxRate || undefined, tax_amount: taxRate > 0 ? amount * taxRate / 100 : undefined,
    };

    if (reconcileWith) {
      txData.reconciled = true;
      if (reconcileWith.entityType === 'receivable') txData.receivable_id = reconcileWith.item.id;
      if (reconcileWith.entityType === 'payable') txData.payable_id = reconcileWith.item.id;
    }

    const tx = await base44.entities.Transaction.create(txData);

    // Atualiza status do item conciliado
    if (reconcileWith) {
      if (reconcileWith.entityType === 'receivable') {
        await base44.entities.Receivable.update(reconcileWith.item.id, { status: 'received', transaction_id: tx.id });
      } else {
        await base44.entities.Payable.update(reconcileWith.item.id, { status: 'paid', transaction_id: tx.id });
      }
      toast.success('Lançamento criado e conciliado!');
    } else {
      toast.success('Lançamento criado!');
    }

    setSaving(false);
    onSaved();
  };

  const handleDescriptionBlur = () => {
    if (form.description.length > 2) {
      const match = findMatch(form.description, form.type);
      setMatchSuggestion(match || null);
    }
  };

  // Tela de confirmação de conciliação
  if (matchSuggestion) {
    const { item, entityType } = matchSuggestion;
    const label = entityType === 'receivable' ? 'conta a receber' : 'conta a pagar';
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Possível conciliação encontrada
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Encontrei uma <strong>{label}</strong> pendente com nome similar ao seu lançamento. É referente a isso?
            </p>
            <div className="bg-accent/30 rounded-xl p-4 border border-border space-y-1">
              <p className="text-sm font-semibold">{item.description}</p>
              <p className="text-sm text-emerald-600 font-bold">{fmt(item.net_amount || item.amount)}</p>
              {item.due_date && <p className="text-xs text-muted-foreground">Vencimento: {format(new Date(item.due_date), 'dd/MM/yyyy')}</p>}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full gap-2"
                onClick={() => handleSave(matchSuggestion)}
                disabled={saving}
              >
                <LinkIcon className="w-4 h-4" />
                Sim, conciliar com essa {label}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setMatchSuggestion(false); handleSave(null); }}
                disabled={saving}
              >
                Não, são lançamentos diferentes
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lançamento Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              onBlur={handleDescriptionBlur}
              className="mt-1"
              placeholder="Ex: Almoço no restaurante"
            />
            {matchSuggestion && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Possível conciliação encontrada
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => { set('type', v); setMatchSuggestion(null); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Despesa</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor Bruto (R$) *</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
            </div>
            {form.type === 'income' && (
              <>
                <div>
                  <Label>Alíquota Imposto (%)</Label>
                  <Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="mt-1" placeholder="0" />
                </div>
                <div>
                  <Label>Membro</Label>
                  <Select value={form.member} onValueChange={v => set('member', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu">Eu</SelectItem>
                      <SelectItem value="conjuge">Cônjuge</SelectItem>
                      <SelectItem value="familia">Família</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={() => handleSave()} disabled={saving} className="flex-1">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}