import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Building2, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const emptyForm = {
  name: '', sigla: '', income_source_id: '', payment_day: '1', payment_months_offset: '1',
  valor_sd_semana: '', valor_sn_semana: '', valor_sd_fds: '', valor_sn_fds: '', valor_sobreaviso: '',
};

export default function Hospitals() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setEdit = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

  const startEdit = (h) => {
    setEditingId(h.id);
    setEditForm({
      name: h.name || '',
      sigla: h.sigla || '',
      income_source_id: h.income_source_id || '',
      payment_day: String(h.payment_day || 1),
      payment_months_offset: String(h.payment_months_offset || 1),
      valor_sd_semana: String(h.valor_sd_semana || ''),
      valor_sn_semana: String(h.valor_sn_semana || ''),
      valor_sd_fds: String(h.valor_sd_fds || ''),
      valor_sn_fds: String(h.valor_sn_fds || ''),
      valor_sobreaviso: String(h.valor_sobreaviso || ''),
    });
  };

  const { data: hospitals = [] } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => base44.entities.Hospital.list(),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Hospital.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hospitals'] });
      setShowForm(false);
      setForm(emptyForm);
      toast.success('Hospital cadastrado!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Hospital.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hospitals'] });
      setEditingId(null);
      toast.success('Hospital atualizado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Hospital.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hospitals'] }); toast.success('Removido'); },
  });

  const handleUpdate = () => {
    if (!editForm.name || !editForm.sigla) return toast.error('Nome e sigla são obrigatórios');
    updateMutation.mutate({
      id: editingId,
      data: {
        ...editForm,
        payment_day: parseInt(editForm.payment_day) || 1,
        payment_months_offset: parseInt(editForm.payment_months_offset) || 1,
        valor_sd_semana: parseFloat(editForm.valor_sd_semana) || 0,
        valor_sn_semana: parseFloat(editForm.valor_sn_semana) || 0,
        valor_sd_fds: parseFloat(editForm.valor_sd_fds) || 0,
        valor_sn_fds: parseFloat(editForm.valor_sn_fds) || 0,
        valor_sobreaviso: parseFloat(editForm.valor_sobreaviso) || 0,
      },
    });
  };

  const handleCreate = () => {
    if (!form.name || !form.sigla) return toast.error('Nome e sigla são obrigatórios');
    createMutation.mutate({
      ...form,
      payment_day: parseInt(form.payment_day) || 1,
      payment_months_offset: parseInt(form.payment_months_offset) || 1,
      valor_sd_semana: parseFloat(form.valor_sd_semana) || 0,
      valor_sn_semana: parseFloat(form.valor_sn_semana) || 0,
      valor_sd_fds: parseFloat(form.valor_sd_fds) || 0,
      valor_sn_fds: parseFloat(form.valor_sn_fds) || 0,
      valor_sobreaviso: parseFloat(form.valor_sobreaviso) || 0,
      active: true,
    });
  };

  const pjSources = sources.filter(s => s.type === 'pj');

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Hospitais</h1>
          <p className="text-muted-foreground text-sm mt-1">Cadastre as instituições onde você trabalha</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> Adicionar
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Novo Hospital</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" placeholder="Hospital das Clínicas" />
                </div>
                <div>
                  <Label>Sigla *</Label>
                  <Input value={form.sigla} onChange={e => set('sigla', e.target.value)} className="mt-1" placeholder="HC" />
                </div>
              </div>

              <div className="col-span-2">
                <Label>PJ de Recebimento</Label>
                <Select value={form.income_source_id} onValueChange={v => set('income_source_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a PJ..." /></SelectTrigger>
                  <SelectContent>
                    {pjSources.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                    {pjSources.length === 0 && (
                      <SelectItem value={null} disabled>Nenhuma PJ cadastrada em Configurações</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Dia do pagamento</Label>
                <Input type="number" min="1" max="31" value={form.payment_day} onChange={e => set('payment_day', e.target.value)} className="mt-1" placeholder="Ex: 1, 10, 15" />
              </div>
              <div>
                <Label>Meses após competência</Label>
                <Select value={form.payment_months_offset} onValueChange={v => set('payment_months_offset', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 mês (mês seguinte)</SelectItem>
                    <SelectItem value="2">2 meses</SelectItem>
                    <SelectItem value="3">3 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Valores dos Plantões</p>

              <div>
                <Label>SD Seg–Sex (R$)</Label>
                <Input type="number" value={form.valor_sd_semana} onChange={e => set('valor_sd_semana', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
              <div>
                <Label>SN Seg–Sex (R$)</Label>
                <Input type="number" value={form.valor_sn_semana} onChange={e => set('valor_sn_semana', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
              <div>
                <Label>SD Fim de Semana (R$)</Label>
                <Input type="number" value={form.valor_sd_fds} onChange={e => set('valor_sd_fds', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
              <div>
                <Label>SN Fim de Semana (R$)</Label>
                <Input type="number" value={form.valor_sn_fds} onChange={e => set('valor_sn_fds', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
              <div>
                <Label>Adicional Sobreaviso (R$)</Label>
                <Input type="number" value={form.valor_sobreaviso} onChange={e => set('valor_sobreaviso', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="flex-1">Salvar Hospital</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {hospitals.length === 0 && !showForm && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum hospital cadastrado ainda.</p>
        )}
        {hospitals.map(h => {
          const pj = sources.find(s => s.id === h.income_source_id);
          const isExp = expanded === h.id;
          const isEditing = editingId === h.id;

          return (
            <Card key={h.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{h.name}</p>
                      <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{h.sigla}</Badge>
                      {pj && <Badge className="text-xs py-0 h-4 px-1.5 bg-amber-100 text-amber-700 border-0">{pj.name}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>SD: {fmt(h.valor_sd_semana)} / {fmt(h.valor_sd_fds)} FDS</span>
                      <span>·</span>
                      <span>SN: {fmt(h.valor_sn_semana)} / {fmt(h.valor_sn_fds)} FDS</span>
                      {h.payment_day && <span>· Pgto dia {h.payment_day}/{h.payment_months_offset > 1 ? `+${h.payment_months_offset}m` : 'mês seg.'}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="w-8 h-8"
                      onClick={() => { if (isEditing) { setEditingId(null); } else { startEdit(h); setExpanded(null); } }}
                    >
                      {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setExpanded(isExp ? null : h.id)}>
                      {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(h.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Label>Nome *</Label>
                        <Input value={editForm.name} onChange={e => setEdit('name', e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>Sigla *</Label>
                        <Input value={editForm.sigla} onChange={e => setEdit('sigla', e.target.value)} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>PJ de Recebimento</Label>
                      <Select value={editForm.income_source_id} onValueChange={v => setEdit('income_source_id', v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a PJ..." /></SelectTrigger>
                        <SelectContent>
                          {pjSources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Dia do pagamento</Label>
                        <Input type="number" min="1" max="31" value={editForm.payment_day} onChange={e => setEdit('payment_day', e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>Meses após competência</Label>
                        <Select value={editForm.payment_months_offset} onValueChange={v => setEdit('payment_months_offset', v)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 mês (mês seguinte)</SelectItem>
                            <SelectItem value="2">2 meses</SelectItem>
                            <SelectItem value="3">3 meses</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valores dos Plantões</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>SD Seg–Sex (R$)</Label><Input type="number" value={editForm.valor_sd_semana} onChange={e => setEdit('valor_sd_semana', e.target.value)} className="mt-1" /></div>
                      <div><Label>SN Seg–Sex (R$)</Label><Input type="number" value={editForm.valor_sn_semana} onChange={e => setEdit('valor_sn_semana', e.target.value)} className="mt-1" /></div>
                      <div><Label>SD Fim de Semana (R$)</Label><Input type="number" value={editForm.valor_sd_fds} onChange={e => setEdit('valor_sd_fds', e.target.value)} className="mt-1" /></div>
                      <div><Label>SN Fim de Semana (R$)</Label><Input type="number" value={editForm.valor_sn_fds} onChange={e => setEdit('valor_sn_fds', e.target.value)} className="mt-1" /></div>
                      <div><Label>Adicional Sobreaviso (R$)</Label><Input type="number" value={editForm.valor_sobreaviso} onChange={e => setEdit('valor_sobreaviso', e.target.value)} className="mt-1" /></div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">Cancelar</Button>
                      <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="flex-1">Salvar</Button>
                    </div>
                  </div>
                )}

                {!isEditing && isExp && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">SD Seg–Sex</span><span className="font-medium">{fmt(h.valor_sd_semana)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SN Seg–Sex</span><span className="font-medium">{fmt(h.valor_sn_semana)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SD FDS</span><span className="font-medium">{fmt(h.valor_sd_fds)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SN FDS</span><span className="font-medium">{fmt(h.valor_sn_fds)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sobreaviso</span><span className="font-medium">{fmt(h.valor_sobreaviso)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pagamento esperado</span><span className="font-medium">Dia {h.payment_day || 1} · {h.payment_months_offset || 1} mês(es) depois</span></div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}