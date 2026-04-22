import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Building2, MessageSquare, ExternalLink, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '', notes: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({ name: '', type: 'credit', bank: '' });
  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const createCardMutation = useMutation({
    mutationFn: (data) => base44.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowCardForm(false);
      setCardForm({ name: '', type: 'credit', bank: '' });
      toast.success('Cartão adicionado!');
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id) => base44.entities.Card.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Cartão removido'); },
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.IncomeSource.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowForm(false);
      setForm({ name: '', type: 'pj', bank: '', default_tax_rate: '', notes: '' });
      toast.success('Fonte de renda criada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.IncomeSource.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removida'); },
  });

  const handleCreate = () => {
    if (!form.name) return toast.error('Informe o nome da fonte');
    createMutation.mutate({ ...form, default_tax_rate: parseFloat(form.default_tax_rate) || 0, active: true });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-sora font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie suas fontes de renda</p>
      </div>

      {/* Income Sources */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Fontes de Renda
          </CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome da Fonte *</Label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" placeholder="Ex: Empresa ABC, Freelance Y" />
                </div>
                <div>
                  <Label>Tipo de Vínculo</Label>
                  <Select value={form.type} onValueChange={v => set('type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clt">CLT (Empregado)</SelectItem>
                      <SelectItem value="pj">PJ (Pessoa Jurídica)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.type === 'pj' && (
                  <div>
                    <Label>Alíquota Padrão (%)</Label>
                    <Input type="number" value={form.default_tax_rate} onChange={e => set('default_tax_rate', e.target.value)} className="mt-1" placeholder="Ex: 11.5" />
                  </div>
                )}
                <div>
                  <Label>Banco de Recebimento</Label>
                  <Input value={form.bank} onChange={e => set('bank', e.target.value)} className="mt-1" placeholder="Ex: Nubank, Itaú..." />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}

          {sources.length === 0 && !showForm && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma fonte cadastrada. Adicione suas fontes de renda (CLT, PJ, etc).</p>
          )}

          {sources.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.type === 'clt' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{s.type.toUpperCase()}</Badge>
                    {s.bank && <span className="text-xs text-muted-foreground">{s.bank}</span>}
                    {s.default_tax_rate > 0 && (
                      <span className="text-xs text-amber-600 font-medium">IR {s.default_tax_rate}%</span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(s.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cards */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Meus Cartões
          </CardTitle>
          <Button size="sm" onClick={() => setShowCardForm(!showCardForm)}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showCardForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do Cartão *</Label>
                  <Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} className="mt-1" placeholder="Ex: Nubank, Itaú Platinum" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={cardForm.type} onValueChange={v => setCard('type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Crédito</SelectItem>
                      <SelectItem value="debit">Débito</SelectItem>
                      <SelectItem value="both">Crédito e Débito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Banco</Label>
                  <Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} className="mt-1" placeholder="Ex: Nubank, Itaú" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCardForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={() => { if (!cardForm.name) return toast.error('Informe o nome'); createCardMutation.mutate({ ...cardForm, active: true }); }} disabled={createCardMutation.isPending} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}
          {cards.length === 0 && !showCardForm && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum cartão cadastrado. Adicione seus cartões para usá-los nos lançamentos via WhatsApp.</p>
          )}
          {cards.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">
                      {c.type === 'credit' ? 'Crédito' : c.type === 'debit' ? 'Débito' : 'Crédito e Débito'}
                    </Badge>
                    {c.bank && <span className="text-xs text-muted-foreground">{c.bank}</span>}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteCardMutation.mutate(c.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* WhatsApp Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Integração WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-accent/30 rounded-xl p-4 text-sm space-y-2">
            <p className="font-medium">Como usar o WhatsApp para lançar gastos:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Vá em <strong>Entrada via WhatsApp</strong> no menu lateral</li>
              <li>Cole mensagens de texto, envie fotos de recibos ou PDFs de faturas</li>
              <li>A IA extrai os dados, categoriza e concilia automaticamente</li>
              <li>Você revisa e confirma antes de salvar</li>
            </ul>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-3">
            <p className="font-medium text-green-700">📱 Conectar seu WhatsApp ao agente FinançasZap</p>
            <p className="text-green-600 text-xs">Clique no botão abaixo para vincular seu WhatsApp. Depois disso, basta mandar uma mensagem como <em>"Gastei R$50 no mercado"</em> e o lançamento é criado automaticamente.</p>
            <a
              href={base44.agents.getWhatsAppConnectURL('financas_zap')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-green-600 hover:bg-green-700 text-white w-full mt-1">
                <MessageSquare className="w-4 h-4 mr-2" />
                Conectar WhatsApp
                <ExternalLink className="w-3 h-3 ml-2 opacity-70" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}