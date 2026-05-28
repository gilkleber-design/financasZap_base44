import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addWeeks, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateShiftValue, calcLiquido, resolveHospitalPaymentModel } from '@/lib/shifts';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const kindStyle = {
  regular: 'border-blue-300 bg-blue-50 text-blue-800',
  extra: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  avista: 'border-green-300 bg-green-50 text-green-800',
  sobreaviso: 'border-red-300 bg-red-50 text-red-800',
};

export default function ShiftModal({ date, hospitals, sources = [], existingShifts = [], onSave, onClose, onCancelShift }) {
  const [hospitalId, setHospitalId] = useState('');
  const [shiftType, setShiftType] = useState('SD');
  const [shiftKind, setShiftKind] = useState('regular');
  const [repeat, setRepeat] = useState('none');
  const [isAvista, setIsAvista] = useState(false);
  const [isTurno, setIsTurno] = useState(false);
  const [notes, setNotes] = useState('');

  const hospital = hospitals.find(h => h.id === hospitalId);
  const source = hospital ? sources.find(s => s.id === hospital.income_source_id) : null;
  const paymentModel = resolveHospitalPaymentModel(hospital);
  const valueResult = hospital ? calculateShiftValue({ hospital, shiftDate: date, type: shiftType, isTurno }) : { value: null, error: null };
  const bruto = valueResult.value;
  const liquido = bruto != null ? calcLiquido(bruto, source) : null;
  const taxRate = source?.default_tax_rate || 0;

  const activeShifts = existingShifts.filter(s => s.status !== 'cancelled');

  const handleSave = () => {
    if (!hospitalId || valueResult.error || bruto == null) return;

    const shifts = [];
    const base = {
      hospital_id: hospitalId,
      type: shiftType,
      shift_kind: shiftKind,
      is_avista: isAvista,
      is_turno: isTurno,
      status: isAvista ? 'done' : 'scheduled',
    };
    const startDate = new Date(date + 'T12:00:00');

    const addShift = (d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const result = calculateShiftValue({ hospital, shiftDate: dateStr, type: shiftType, isTurno });
      shifts.push({ ...base, date: dateStr, valor: result.value, ...(notes ? { notes } : {}) });
    };

    if (repeat === 'none' || isAvista) {
      addShift(startDate);
    } else if (repeat === 'biweekly') {
      const endDate = addMonths(startDate, 24);
      let current = startDate;
      while (current <= endDate) { addShift(current); current = addWeeks(current, 2); }
    } else if (repeat === 'weekly') {
      const endDate = addMonths(startDate, 24);
      let current = startDate;
      while (current <= endDate) { addShift(current); current = addWeeks(current, 1); }
    }

    onSave(shifts, { isAvista, hospital, source, bruto, liquido, taxRate, date });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Plantão — {format(new Date(date + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {activeShifts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700">Plantões já agendados neste dia:</p>
              {activeShifts.map(s => {
                const h = hospitals.find(h => h.id === s.hospital_id);
                const src = h ? sources.find(src => src.id === h.income_source_id) : null;
                const liq = calcLiquido(s.valor || 0, src);
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-amber-800 font-medium">
                      {h?.sigla} — {s.type} ({s.shift_kind})
                      {s.is_avista ? ' · à vista' : ''}
                      {s.is_turno ? ' · turno' : ''}
                      {' · '}
                      <span className="text-emerald-700">{fmt(liq)}</span>
                      {src?.default_tax_rate > 0 && <span className="text-muted-foreground ml-1">({fmt(s.valor)} bruto)</span>}
                    </span>
                    {onCancelShift && (
                      <button onClick={() => onCancelShift(s.id)} className="text-red-500 hover:text-red-700 underline ml-2">
                        Cancelar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <Label>Hospital *</Label>
            <Select value={hospitalId} onValueChange={setHospitalId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {hospitals.map(h => (
                  <SelectItem key={h.id} value={h.id}>{h.sigla} — {h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hospital && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={shiftType} onValueChange={setShiftType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SD">SD</SelectItem>
                      <SelectItem value="SN">SN</SelectItem>
                      <SelectItem value="SA">SA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Natureza</Label>
                  <Select value={shiftKind} onValueChange={setShiftKind}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="extra">Extra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">À vista</Label>
                  <Switch checked={isAvista} onCheckedChange={(checked) => { setIsAvista(checked); if (checked) setRepeat('none'); }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Turno (meio plantão)</Label>
                  <Switch checked={isTurno} onCheckedChange={setIsTurno} />
                </div>
              </div>
            </div>
          )}

          {!isAvista && hospital && (
            <div>
              <Label>Repetição</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete (plantão único)</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isAvista && hospital && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
              Plantão à vista: um recebível será gerado imediatamente com vencimento no dia do plantão e ele não entra no fechamento do mês.
            </div>
          )}

          {hospital && valueResult.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {valueResult.error}
            </div>
          )}

          {hospital && !valueResult.error && bruto != null && (
            <div className={`rounded-xl p-3 border ${kindStyle[shiftType === 'SA' ? 'sobreaviso' : isAvista ? 'avista' : shiftKind] || 'bg-accent/30 border-border'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Valor líquido</span>
                <span className="font-bold text-lg">{fmt(liquido)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs opacity-70">Bruto ({taxRate}% imposto)</span>
                  <span className="text-xs font-medium opacity-70">{fmt(bruto)}</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">Modelo: {paymentModel === 'so_plantao' ? 'Só plantão' : paymentModel === 'plantao_producao' ? 'Plantão + produção (separado)' : 'Só produção'}</div>
            </div>
          )}

          {repeat !== 'none' && !isAvista && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              {repeat === 'weekly'
                ? 'Serão criados ~104 plantões (toda semana pelos próximos 2 anos).'
                : 'Serão criados ~52 plantões (toda quinzena pelos próximos 2 anos).'}
              {' '}Cancele individualmente os que não ocorrerem.
            </p>
          )}

          <div>
            <Label>OBS</Label>
            <textarea
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Observações (opcional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows="2"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={!hospitalId || !!valueResult.error || bruto == null} className="flex-1">
            {repeat !== 'none' && !isAvista ? 'Criar Plantões' : 'Criar Plantão'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}