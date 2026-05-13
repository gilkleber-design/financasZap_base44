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
import { Plus, Trash2, Building2, MessageSquare, CreditCard, Landmark, Tag, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import CategoryManager from '@/components/settings/CategoryManager';
import CategoryRuleManager from '@/components/settings/CategoryRuleManager';
import WorkspaceMembersPanel from '@/components/settings/WorkspaceMembersPanel';

export default function Settings() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [openSections, setOpenSections] = useState({ members: false, sources: false, accounts: false, cards: true, rules: false, categories: false });

  const toggleSection = (section) => setOpenSections(p => ({ ...p, [section]: !p[section] }));

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // --- ESTADOS DE FORMULÁRIO E EDIÇÃO ---
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '0', notes: '' });
  
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'corrente', bank: '' });

  const [editingCardId, setEditingCardId] = useState(null);
  const [cardForm, setCardForm] = useState({
    name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '',
    is_additional: false, principal_card_id: '', assigned_user_id: '',
  });

  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  // --- QUERIES ---
  const { data: allCards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: members = [] } = useQuery({ queryKey: ['workspace_members'], queryFn: () => base44.entities.User.list(), enabled: currentUser?.role === 'admin' });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: sources = [] } = useQuery({ queryKey: ['income_sources'], queryFn: () => base44.entities.IncomeSource.list() });

  const cards = currentUser?.role === 'admin' ? allCards : allCards.filter(c => !c.assigned_user_id || c.assigned_user_id === currentUser?.id);

  // --- MUTAÇÕES (SAVE / UPDATE) ---
  const upsertCard = useMutation({
    mutationFn: (data) => editingCardId ? base44.entities.Card.update(editingCardId, data) : base44.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditingCardId(null);
      setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' });
      toast.success(editingCardId ? 'Card atualizado' : 'Card criado');
    }
  });

  const upsertAccount = useMutation({
    mutationFn: (data) => editingAccountId ? base44.entities.Account.update(editingAccountId, data) : base44.entities.Account.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingAccountId(null); setAccountForm({ name: '', type: 'corrente', bank: '' }); toast.success('Sucesso!'); }
  });

  const upsertSource = useMutation({
    mutationFn: (data) => editingSourceId ? base44.entities.IncomeSource.update(editingSourceId, data) : base44.entities.IncomeSource.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingSourceId(null); setForm({ name: '', type: 'pj', bank: '', default_tax_rate: '0', notes: '' }); toast.success('Sucesso!'); }
  });

  const deleteMutation = (entity) => useMutation({
    mutationFn: (id) => base44.entities[entity].delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Removido'); }
  });

  const delCard = deleteMutation('Card');
  const delAcc = deleteMutation('Account');
  const delSource = deleteMutation('IncomeSource');

  return (
    <div className="p-6 space-y-4 max-w-2xl pb-32 font-sora">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Ajuste seu workspace familiar</p>
      </header>

      {/* SEÇÃO: MEMBROS */}
      <Collapsible open={openSections.members} onOpenChange={() => toggleSection('members')} className="border rounded-xl bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto hover:bg-accent/50">
            <div className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> <span>Membros do Workspace</span></div>
            {openSections.members ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <WorkspaceMembersPanel currentUser={currentUser} />
        </CollapsibleContent>
      </Collapsible>

      {/* SEÇÃO: FONTES DE RENDA */}
      <Collapsible open={openSections.sources} onOpenChange={() => toggleSection('sources')} className="border rounded-xl bg-card">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> <span>Fontes de Renda</span></div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{sources.length}</Badge>
              {openSections.sources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          {(editingSourceId || openSections.sources) && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3">
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome da Fonte" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingSourceId(null)}>Cancelar</Button>
                <Button className="flex-1" onClick={() => upsertSource.mutate({...form, active: true})}>{editingSourceId ? 'Atualizar' : 'Salvar'}</Button>
              </div>
            </div>
          )}
          {sources.map(s => (
            <div key={s.id} className="flex items-center justify-between p-2 border-b last:border-0">
              <span className="text-sm font-medium">{s.name}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditingSourceId(s.id); setForm(s); }}><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" className="text-red-500" onClick={() => delSource.mutate(s.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* SEÇÃO: CARTÕES (Principal) */}
      <Collapsible open={openSections.cards} onOpenChange={() => toggleSection('cards')} className="border rounded-xl bg-card shadow-sm border-primary/20">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto">
            <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> <span>Cartões & Adicionais</span></div>
            {openSections.cards ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4 bg-slate-50/30">
          
          {/* Formulário de Cartão (Add/Edit) */}
          <div className="border border-primary/20 rounded-xl p-4 space-y-4 bg-white shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome do Titular *</Label><Input value={cardForm.holder_name} onChange={e => setCard('holder_name', e.target.value)} /></div>
              <div className={cardForm.is_additional ? "col-span-2" : "col-span-1"}><Label>Apelido *</Label><Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} /></div>
              {!cardForm.is_additional && (<div><Label>Banco</Label><Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} /></div>)}

              <div className="col-span-2 flex items-center justify-between p-2 bg-slate-100 rounded-lg">
                <span className="text-xs font-semibold">Cartão Adicional?</span>
                <Switch checked={cardForm.is_additional} onCheckedChange={v => setCard('is_additional', v)} />
              </div>

              {cardForm.is_additional ? (
                <div className="col-span-2"><Label>Cartão Principal</Label>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">Todos</SelectItem>{members.map(m => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {editingCardId && <Button variant="outline" className="flex-1" onClick={() => { setEditingCardId(null); setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' }); }}>Cancelar</Button>}
              <Button className="flex-1" onClick={() => {
                let data = { ...cardForm, active: true };
                if (data.is_additional) {
                  const p = allCards.find(c => c.id === data.principal_card_id);
                  data = { ...data, bank: p?.bank, closing_day: p?.closing_day, due_day: p?.due_day };
                }
                upsertCard.mutate(data);
              }}>{editingCardId ? 'Atualizar Cartão' : 'Salvar Novo Cartão'}</Button>
            </div>
          </div>

          {/* Listagem de Cartões Organizada */}
          <div className="space-y-2">
            {cards.sort((a, b) => (b.principal_card_id === a.id ? -1 : a.principal_card_id === b.id ? 1 : 0)).map(c => (
              <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${c.is_additional ? 'bg-amber-50/40 ml-6' : 'bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <CreditCard className={`w-4 h-4 ${c.is_additional ? 'text-amber-600' : 'text-primary'}`} />
                  <div>
                    <p className="text-sm font-bold">{c.name} {c.is_additional && <span className="text-[10px] text-amber-600">(Adicional)</span>}</p>
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">{c.holder_name}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditingCardId(c.id); setCardForm(c); }}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-500" onClick={() => delCard.mutate(c.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* SEÇÃO: REGRAS E CATEGORIAS (Simplificadas para Colapsar) */}
      <Collapsible open={openSections.rules} onOpenChange={() => toggleSection('rules')} className="border rounded-xl bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto"><div className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> <span>Regras de Categorização</span></div>{openSections.rules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryRuleManager /></CollapsibleContent>
      </Collapsible>

      <Collapsible open={openSections.categories} onOpenChange={() => toggleSection('categories')} className="border rounded-xl bg-card">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto"><div className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> <span>Categorias Personalizadas</span></div>{openSections.categories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryManager /></CollapsibleContent>
      </Collapsible>

      {/* WHATSAPP (Sempre Visível no Fundo) */}
      <Card className="border-0 shadow-sm bg-green-50/50">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-600" /><span className="text-sm font-medium">WhatsApp FinançasZap</span></div>
          <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-green-600 hover:bg-green-700">Conectar</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}