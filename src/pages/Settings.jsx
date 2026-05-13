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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Building2, MessageSquare, CreditCard, Landmark, Tag, ChevronDown, ChevronUp, Pencil, UserPlus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import CategoryManager from '@/components/settings/CategoryManager';
import CategoryRuleManager from '@/components/settings/CategoryRuleManager';

export default function Settings() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [openSections, setOpenSections] = useState({ members: false, sources: false, accounts: false, cards: true, rules: false, categories: false });

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showNewSource, setShowNewSource] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewCard, setShowNewCard] = useState(false);

  const toggleSection = (section) => setOpenSections(p => ({ ...p, [section]: !p[section] }));

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const [inviteEmail, setInviteEmail] = useState('');
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '0' });
  const [accountForm, setAccountForm] = useState({ name: '', type: 'corrente', bank: '' });
  const [cardForm, setCardForm] = useState({
    name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '',
    is_additional: false, principal_card_id: '', assigned_user_id: '',
  });

  const [editingSourceId, setEditingSourceId] = useState(null);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingCardId, setEditingCardId] = useState(null);

  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  const { data: members = [] } = useQuery({ queryKey: ['workspace_members'], queryFn: () => base44.entities.User.list(), enabled: currentUser?.role === 'admin' });
  const { data: allCards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: sources = [] } = useQuery({ queryKey: ['income_sources'], queryFn: () => base44.entities.IncomeSource.list() });

  const cards = currentUser?.role === 'admin' ? allCards : allCards.filter(c => !c.assigned_user_id || c.assigned_user_id === currentUser?.id);

  const inviteMember = useMutation({
    mutationFn: (email) => base44.auth.invite(email),
    onSuccess: () => { queryClient.invalidateQueries(['workspace_members']); setShowInviteForm(false); setInviteEmail(''); toast.success('Convite enviado!'); }
  });

  const upsertCard = useMutation({
    mutationFn: (data) => editingCardId ? base44.entities.Card.update(editingCardId, data) : base44.entities.Card.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingCardId(null); setShowNewCard(false); setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' }); toast.success('Cartão salvo!'); }
  });

  const upsertAccount = useMutation({
    mutationFn: (data) => editingAccountId ? base44.entities.Account.update(editingAccountId, data) : base44.entities.Account.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingAccountId(null); setShowNewAccount(false); toast.success('Conta salva!'); }
  });

  const upsertSource = useMutation({
    mutationFn: (data) => editingSourceId ? base44.entities.IncomeSource.update(editingSourceId, data) : base44.entities.IncomeSource.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingSourceId(null); setShowNewSource(false); toast.success('Fonte salva!'); }
  });

  const deleteEntity = (entity, id) => {
    base44.entities[entity].delete(id).then(() => { queryClient.invalidateQueries(); toast.success('Removido'); });
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl pb-32 font-sora">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerenciamento do Workspace</p>
      </header>

      {/* 1. MEMBROS */}
      <Collapsible open={openSections.members} onOpenChange={() => toggleSection('members')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto hover:bg-accent/50 text-slate-700">
            <div className="flex items-center gap-2 font-bold"><ShieldCheck className="w-4 h-4 text-primary" /> Membros</div>
            {openSections.members ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowInviteForm(true)} disabled={showInviteForm}><UserPlus className="w-3.5 h-3.5 mr-1" /> Convidar Membro</Button>
          </div>
          {showInviteForm && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3 border border-primary/10">
              <Label>E-mail</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="exemplo@email.com" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowInviteForm(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={() => inviteMember.mutate(inviteEmail)}>Enviar</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {members.sort((a, b) => (a.role === 'admin' ? -1 : 1)).map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{m.full_name?.substring(0, 2).toUpperCase() || '??'}</div>
                  <div><p className="text-sm font-medium">{m.full_name || m.email}</p><Badge variant={m.role === 'admin' ? 'default' : 'outline'} className="text-[9px] h-4">{m.role === 'admin' ? 'Admin' : 'Membro'}</Badge></div>
                </div>
                {m.id !== currentUser?.id && <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteEntity('User', m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 2. FONTES DE RENDA */}
      <Collapsible open={openSections.sources} onOpenChange={() => toggleSection('sources')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold"><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Fontes de Renda</div>{openSections.sources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end"><Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowNewSource(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Fonte</Button></div>
          {(showNewSource || editingSourceId) && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3">
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome" />
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => {setEditingSourceId(null); setShowNewSource(false)}}>Cancelar</Button><Button className="flex-1" onClick={() => upsertSource.mutate({...form, active: true})}>Salvar</Button></div>
            </div>
          )}
          {sources.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
              <span className="text-sm font-medium">{s.name}</span>
              <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => { setEditingSourceId(s.id); setForm(s); setShowNewSource(true); }}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteEntity('IncomeSource', s.id)}><Trash2 className="w-3.5 h-3.5" /></Button></div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 3. CONTAS BANCÁRIAS */}
      <Collapsible open={openSections.accounts} onOpenChange={() => toggleSection('accounts')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold"><div className="flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> Contas Bancárias</div>{openSections.accounts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end"><Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowNewAccount(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Conta</Button></div>
          {(showNewAccount || editingAccountId) && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3">
              <Input value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} placeholder="Nome" />
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => {setEditingAccountId(null); setShowNewAccount(false)}}>Cancelar</Button><Button className="flex-1" onClick={() => upsertAccount.mutate({...accountForm, active: true})}>Salvar</Button></div>
            </div>
          )}
          {accounts.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
              <span className="text-sm font-medium">{a.name}</span>
              <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => { setEditingAccountId(a.id); setAccountForm(a); setShowNewAccount(true); }}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteEntity('Account', a.id)}><Trash2 className="w-3.5 h-3.5" /></Button></div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* 4. CARTÕES & ADICIONAIS */}
      <Collapsible open={openSections.cards} onOpenChange={() => toggleSection('cards')} className="border rounded-xl bg-card shadow-sm border-primary/20">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold"><div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Cartões & Adicionais</div>{openSections.cards ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end"><Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowNewCard(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Cartão</Button></div>
          {(showNewCard || editingCardId) && (
            <div className="p-4 bg-slate-50/50 rounded-xl space-y-4 border border-primary/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Titular *</Label><Input value={cardForm.holder_name} onChange={e => setCard('holder_name', e.target.value)} /></div>
                <div className={cardForm.is_additional ? "col-span-2" : "col-span-1"}><Label>Apelido *</Label><Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} /></div>
                {!cardForm.is_additional && (<div><Label>Banco</Label><Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} /></div>)}
                <div className="col-span-2 flex items-center justify-between p-3 bg-white rounded-lg border">
                  <span className="text-sm font-medium">Adicional?</span>
                  <Switch checked={cardForm.is_additional} onCheckedChange={v => setCard('is_additional', v)} />
                </div>
                {cardForm.is_additional ? (
                  <div className="col-span-2"><Label>Principal</Label>
                    <Select value={cardForm.principal_card_id} onValueChange={v => setCard('principal_card_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{allCards.filter(c => !c.is_additional).map(pc => (<SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div><Label>Fechamento</Label><Input type="number" value={cardForm.closing_day} onChange={e => setCard('closing_day', e.target.value)} /></div>
                    <div><Label>Vencimento</Label><Input type="number" value={cardForm.due_day} onChange={e => setCard('due_day', e.target.value)} /></div>
                  </>
                )}
                {currentUser?.role === 'admin' && (
                  <div className="col-span-2 border-t pt-2"><Label>Responsável</Label>
                    <Select value={cardForm.assigned_user_id || '_none'} onValueChange={v => setCard('assigned_user_id', v === '_none' ? '' : v)}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="_none">Todos</SelectItem>{members.map(m => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setEditingCardId(null); setShowNewCard(false); }}>Cancelar</Button><Button className="flex-1 font-bold" onClick={() => upsertCard.mutate({...cardForm, active: true})}>Salvar</Button></div>
            </div>
          )}
          <div className="space-y-2">
            {cards.sort((a, b) => (b.principal_card_id === a.id ? -1 : a.principal_card_id === b.id ? 1 : 0)).map(c => (
              <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${c.is_additional ? 'bg-amber-50/40 ml-6 border-amber-100' : 'bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <CreditCard className={`w-4 h-4 ${c.is_additional ? 'text-amber-600' : 'text-primary'}`} />
                  <div>
                    <p className="text-sm font-bold">{c.name} {c.is_additional && <Badge className="ml-1 text-[9px] bg-amber-100 text-amber-700">Adicional</Badge>}</p>
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">{c.holder_name}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { 
                    setEditingCardId(c.id); 
                    setCardForm({ ...c, holder_name: c.holder_name || '' }); // Força o preenchimento do titular
                    setShowNewCard(true); 
                  }}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteEntity('Card', c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 5. REGRAS & CATEGORIAS */}
      <Collapsible open={openSections.rules} onOpenChange={() => toggleSection('rules')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold"><div className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> Regras de Categorização</div>{openSections.rules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryRuleManager /></CollapsibleContent>
      </Collapsible>

      <Collapsible open={openSections.categories} onOpenChange={() => toggleSection('categories')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold"><div className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> Categorias Personalizadas</div>{openSections.categories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryManager /></CollapsibleContent>
      </Collapsible>

      {/* 6. WHATSAPP */}
      <Card className="border border-green-200 shadow-sm bg-green-50/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><MessageSquare className="w-5 h-5 text-green-600" />
            <div><p className="text-sm font-bold text-green-800">WhatsApp FinançasZap</p><p className="text-[10px] text-green-600">Conectado</p></div>
          </div>
          <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 font-bold border-none">Conectar</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}