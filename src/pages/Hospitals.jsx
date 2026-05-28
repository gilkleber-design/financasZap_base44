import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveHospitalPaymentModel } from '@/lib/shifts';

const paymentModelLabels = {
  so_plantao: 'Só plantão',
  plantao_producao: 'Plantão + produção',
  so_producao: 'Só produção',
};

const emptyForm = {
  name: '', sigla: '', income_source_id: '',
  payment_model: 'so_plantao',
  payment_day: '1', payment_months_offset: '1',
  valor_medio_pdt: '', atraso_medio_pdt: '',
  valor_sd_semana: '', valor_sn_semana: '', valor_sd_fds: '', valor_sn_fds: '', valor_sobreaviso: '',
};

function HospitalForm({ form, set, sources, onSave, onCancel, saving }) {
  const paymentModel = form.payment_model ?? '';
  const showShiftFields = paymentModel !== 'so_producao';
  const showPdtFields = paymentModel !== 'so_plantao';
  const pjSources = sources.filter(s => s.type === 'pj');

  return (
    <div className="space-y-4">
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

      <div>
        <Label>Modelo de remuneração</Label>
        <Select value={paymentModel} onValueChange={v => set('payment_model', v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="so_plantao">Só plantão</SelectItem>
            <SelectItem value="plantao_producao">Plantão + produção</SelectItem>
            <SelectItem value="so_producao">Só produção</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>PJ de Recebimento</Label>
        <Select value={form.income_source_id} onValueChange={v => set('income_source_id', v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a PJ..." /></SelectTrigger>
          <SelectContent>
            {pjSources.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
            {pjSources.length === 0 && (
              <SelectItem value="none" disabled>Nenhuma PJ cadastrada em Configurações</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {showShiftFields && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dia do pagamento</Label>
              <Input type="number" min="1" max="31" value={form.payment_day} onChange={e => set('payment_day', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Meses após competência</Label>
              <Select value={String(form.payment_months_offset)} onValueChange={v => set('payment_months_offset', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 (mês atual)</SelectItem>
                  <SelectItem value="1">1 mês</SelectItem>
                  <SelectItem value="2">2 meses</SelectItem>
                  <SelectItem value="3">3 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Valores dos Plantões</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SD Seg–Sex (R$)</Label>
              <CurrencyInput value={form.valor_sd_semana} onChange={(value) => set('valor_sd_semana', value)} className="mt-1" />
            </div>
            <div>
              <Label>SN Seg–Sex (R$)</Label>
              <CurrencyInput value={form.valor_sn_semana} onChange={(value) => set('valor_sn_semana', value)} className="mt-1" />
            </div>
            <div>
              <Label>SD Fim de Semana (R$)</Label>
              <CurrencyInput value={form.valor_sd_fds} onChange={(value) => set('valor_sd_fds', value)} className="mt-1" />
            </div>
            <div>
              <Label>SN Fim de Semana (R$)</Label>
              <CurrencyInput value={form.valor_sn_fds} onChange={(value) => set('valor_sn_fds', value)} className="mt-1" />
            </div>
            <div>
              <Label>Sobreaviso (R$)</Label>
              <CurrencyInput value={form.valor_sobreaviso} onChange={(value) => set('valor_sobreaviso', value)} className="mt-1" />
            </div>
          </div>
        </>
      )}

      {showPdtFields && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor médio PDT</Label>
            <CurrencyInput value={form.valor_medio_pdt} onChange={(value) => set('valor_medio_pdt', value)} className="mt-1" />
          </div>
          <div>
            <Label>Atraso médio PDT (dias)</Label>
            <Input type="number" min="0" value={form.atraso_medio_pdt} onChange={e => set('atraso_medio_pdt', e.target.value)} className="mt-1" />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button onClick={onSave} disabled={saving} className="flex-1">Salvar Hospital</Button>
      </div>
    </div>
  );
}

export default function Hospitals() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
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
      payment_model: resolveHospitalPaymentModel(h),
      payment_day: String(h.payment_day || 1),
      payment_months_offset: String(h.payment_months_offset || 1),
      valor_medio_pdt: String(h.valor_medio_pdt || ''),
      atraso_medio_pdt: String(h.atraso_medio_pdt || ''),
      valor_sd_semana: String(h.valor_sd_semana ?? ''),
      valor_sn_semana: String(h.valor_sn_semana ?? ''),
      valor_sd_fds: String(h.valor_sd_fds ?? ''),
      valor_sn_fds: String(h.valor_sn_fds ?? ''),
      valor_sobreaviso: String(h.valor_sobreaviso ?? ''),
    });
  };

  const { data: hospitals = [] } = useQuery({ queryKey: ['hospitals'], queryFn: () => base44.entities.Hospital.list() });
  const { data: sources = [] } = useQuery({ queryKey: ['income_sources'], queryFn: () => base44.entities.IncomeSource.list() });

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

  const parseNumberOrUndefined = (value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const parseFormData = (f) => ({
    ...f,
    payment_day: parseInt(f.payment_day) || 1,
    payment_months_offset: parseInt(f.payment_months_offset) || 1,
    valor_medio_pdt: parseNumberOrUndefined(f.valor_medio_pdt),
    atraso_medio_pdt: parseNumberOrUndefined(f.atraso_medio_pdt),
    valor_sd_semana: parseNumberOrUndefined(f.valor_sd_semana),
    valor_sn_semana: parseNumberOrUndefined(f.valor_sn_semana),
    valor_sd_fds: parseNumberOrUndefined(f.valor_sd_fds),
    valor_sn_fds: parseNumberOrUndefined(f.valor_sn_fds),
    valor_sobreaviso: parseNumberOrUndefined(f.valor_sobreaviso),
  });

  const handleCreate = () => {
    if (!form.name || !form.sigla) return toast.error('Nome e sigla são obrigatórios');
    createMutation.mutate({ ...parseFormData(form), active: true });
  };

  const handleUpdate = () => {
    if (!editForm.name || !editForm.sigla) return toast.error('Nome e sigla são obrigatórios');
    updateMutation.mutate({ id: editingId, data: parseFormData(editForm) });
  };

  const sortedHospitals = [...hospitals].sort((a, b) => (a.sigla || '').localeCompare(b.sigla || ''));

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
          <CardContent>
            <HospitalForm form={form} set={set} sources={sources} onSave={handleCreate} onCancel={() => setShowForm(false)} saving={createMutation.isPending} />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {hospitals.length === 0 && !showForm && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum hospital cadastrado ainda.</p>
        )}
        {sortedHospitals.map(h => {
          const pj = sources.find(s => s.id === h.income_source_id);
          const isEditing = editingId === h.id;
          const paymentModel = resolveHospitalPaymentModel(h);

          return (
            <Card key={h.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <p className="font-semibold">{h.sigla}</p>
                    {pj && <Badge className="text-xs py-0 h-4 px-1.5 bg-amber-100 text-amber-700 border-0">{pj.name}</Badge>}
                    <Badge className="text-xs py-0 h-4 px-1.5 border-0 bg-blue-100 text-blue-700">
                      {paymentModelLabels[paymentModel]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => { if (isEditing) { setEditingId(null); } else { startEdit(h); } }}>
                      {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(h.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <HospitalForm form={editForm} set={setEdit} sources={sources} onSave={handleUpdate} onCancel={() => setEditingId(null)} saving={updateMutation.isPending} />
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