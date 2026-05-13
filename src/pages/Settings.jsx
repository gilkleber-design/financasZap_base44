import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Building2, MessageSquare, CreditCard, Landmark, Tag } from 'lucide-react';
import { toast } from 'sonner';

// IMPORTANTE: Certifique-se que estes arquivos existem no seu projeto
import CategoryManager from '@/components/settings/CategoryManager';
import CategoryRuleManager from '@/components/settings/CategoryRuleManager';
import WorkspaceMembersPanel from '@/components/settings/WorkspaceMembersPanel';

export default function Settings() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '', notes: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({
    name: '', 
    holder_name: '', 
    type: 'credit', 
    bank: '', 
    closing_day: '', 
    due_day: '',
    is_additional: false, 
    principal_card_id: '', 
    assigned_user_id: '',
  });
  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'corrente', bank: '' });
  const setAcc = (k, v) => setAccountForm(p => ({ ...p, [k]: v }));

  const { data: allCards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const cards = currentUser?.role === 'admin'
    ? allCards
    : allCards.filter(c => !c.assigned_user_id || c.assigned_user_id === currentUser?.id);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace_members'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin',
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const createCardMutation = useMutation({
    mutationFn: (data) => base44.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowCardForm(false);
      setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' });
      toast.success('Cartão adicionado!');
    },
    onError: (err) => toast.error('Erro ao salvar: ' + (err?.message || 'tente novamente')),
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id) => base44.entities.Card.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Cartão removido'); },
  });

  // Funções de Deletar Genéricas para Contas e Fontes
  const deleteAccountMutation = useMutation({
    mutationFn: (id) => base44.entities.Account.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Conta removida'); },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (id) => base44.entities.IncomeSource.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removida'); },
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl pb-20">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie sua conta e workspace</p>
      </div>

      <WorkspaceMembersPanel currentUser={currentUser} />

      {/* Cartões */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Cartões
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowCardForm(!showCardForm)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {showCardForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-4 bg-accent/20 mb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do Titular (No plástico) *</Label>
                  <Input value={cardForm.holder_name} onChange={e => setCard('holder_name', e.target.value)} placeholder="Ex: Gil Kléber" />
                </div>
                <div className={cardForm.is_additional ? "col-span-2" : "col-span-1"}>
                  <Label>Nome do Cartão (Apelido) *</Label>
                  <Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} placeholder="Ex: Nubank" />
                </div>
                {!cardForm.is_additional && (
                  <div>
                    <Label>Banco</Label>
                    <Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} placeholder="Ex: Bradesco" />
                  </div>
                )}

                <div className="col-span-2 flex items-center justify-between p-3 bg-white/50 rounded-lg border border-dashed border-primary/20">
                  <span className="text-sm font-medium">Este é um Cartão Adicional?</span>
                  <Switch checked={cardForm.is_additional} onCheckedChange={v => setCard('is_additional', v)} />
                </div>

                {cardForm.is_additional ? (
                  <div className="col-span-2">
                    <Label>Vincular ao Cartão Principal *</Label>
                    <Select value={cardForm.principal_card_id} onValueChange={v => setCard('principal_card_id', v)}>
                      <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {allCards.filter(c => !c.is_additional).map(pc => (
                          <SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Fechamento (Dia)</Label>
                      <Input type="number" value={cardForm.closing_day} onChange={e => setCard('closing_day', e.target.value)} />
                    </div>
                    <div>
                      <Label>Vencimento (Dia)</Label>
                      <Input type="number" value={cardForm.due_day} onChange={e => setCard('due_day', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCardForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={() => {
                  if (!cardForm.name || !cardForm.holder_name) return toast.error('Preencha os campos obrigatórios');
                  let data = { ...cardForm, active: true };
                  if (cardForm.is_additional) {
                    const p = allCards.find(c => c.id === cardForm.principal_card_id);
                    data = { ...data, bank: p?.bank, closing_day: p?.closing_day, due_day: p?.due_day };
                  }
                  createCardMutation.mutate(data);
                }} disabled={createCardMutation.isPending} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {cards
              .sort((a, b) => {
                if (b.principal_card_id === a.id) return -1;
                if (a.principal_card_id === b.id) return 1;
                return a.name.localeCompare(b.name);
              })
              .map(c => (
                <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${c.is_additional ? 'bg-amber-50/30 border-amber-100 ml-6' : 'bg-muted/30 border-border'}`}>
                  <div className="flex items-center gap-3">
                    <CreditCard className={`w-4 h-4 ${c.is_additional ? 'text-amber-600' : 'text-primary'}`} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.is_additional && <Badge variant="outline" className="text-[10px] bg-amber-100 border-amber-200">Adicional</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {c.holder_name && <span className="text-[10px] font-bold uppercase text-muted-foreground">{c.holder_name}</span>}
                        <span className="text-xs text-muted-foreground">{c.bank}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteCardMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Contas Bancárias */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary" />
              Contas
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAccountForm(!showAccountForm)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-sm font-medium">{a.name}</span>
                <Button variant="ghost" size="icon" onClick={() => deleteAccountMutation.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Outros Componentes */}
      <CategoryRuleManager />
      <CategoryManager />

      {/* WhatsApp */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Integração WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
            <Button className="bg-green-600 hover:bg-green-700 text-white w-full">Conectar WhatsApp</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}