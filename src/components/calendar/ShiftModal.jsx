import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addWeeks, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function calcValor(hospital, date, shiftType, shiftKind) {
  if (hospital.remuneration_model === 'producao') return 0;
  if (shiftType === 'sobreaviso') return hospital.valor_sobreaviso || 0;
  const dow = new Date(date + 'T12:00:00').getDay();
  const isFds = dow === 0 || dow === 6;
  if (shiftType === 'SD') return isFds ? (hospital.valor_sd_fds || 0) : (hospital.valor_sd_semana || 0);
  return isFds ? (hospital.valor_sn_fds || 0) : (hospital.valor_sn_semana || 0);
}

function calcLiquido(bruto, source) {
  const taxRate = source?.default_tax_rate || 0;
  return taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;
}

const kindStyle = {
  regular: 'border-blue-300 bg-blue-50 text-blue-800',
  extra: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  avista: 'border-green-300 bg-green-50 text-green-800',
  sobreaviso: 'border-red-300 bg-red-50 text-red-800',
};

export default function ShiftModal({ date, hospitals, sources = [], existingShifts = [], onSave, onClose, onCancelShift }) {
  const [hospitalId, setHospitalId] = useState('');
  const [shiftType, setShiftType] = useState('SD'); // SD | SN | sobreaviso
  const [shiftKind, setShiftKind] = useState('regular'); // regular | extra | avista
  const [repeat, setRepeat] = useState('none');
  const [producaoValor, setProducaoValor] = useState('');
  const [notes, setNotes] = useState('');

  const isSobreaviso = shiftType === 'sobreaviso';
  const isAvista = shiftKind === 'avista';

  const hospital = hospitals.find(h => h.id === hospitalId);
  const source = hospital ? sources.find(s => s.id === hospital.income_source_id) : null;
  const isProducao = hospital?.remuneration_model === 'producao';

  // Para salvar na entidade: shift_kind vira 'sobreaviso' quando tipo for sobreaviso
  const effectiveKind = isSobreaviso ? 'sobreaviso' : shiftKind;
  const effectiveType = isSobreaviso ? 'SD' : shiftType; // tipo guardado na entidade (SD/SN), sobreaviso vai no kind

  const bruto = isProducao
    ? (parseFloat(producaoValor) || 0)
    : (hospital ? calcValor(hospital, date, shiftType, effectiveKind) : 0);
  const liquido = calcLiquido(bruto, source);
  const taxRate = source?.default_tax_rate || 0;

  const activeShifts = existingShifts.filter(s => s.status !== 'cancelled');

  const handleSave = () => {
    if (!hospitalId) return;
    if (isProducao && !producaoValor) return;

    const shifts = [];
    const base = {
      hospital_id: hospitalId,
      type: effectiveType,
      shift_kind: effectiveKind,
      status: isAvista ? 'done' : 'scheduled',
    };
    const startDate = new Date(date + 'T12:00:00');

    const addShift = (d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const v = isProducao ? parseFloat(producaoValor) || 0 : calcValor(hospital, dateStr, shiftType, effectiveKind);
      shifts.push({ ...base, date: dateStr, valor: v, ...(notes ? { notes } : {}) });
    };

    if (repeat === 'none' || isAvista || isSobreaviso) {
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
          {/* Plantões existentes no dia */}
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
                      {h?.sigla} — {s.shift_kind === 'sobreaviso' ? '🍅 Sobreaviso' : `${s.type} (${s.shift_kind})`}
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
            <div className="grid grid-cols-2 gap-3">
              {/* Tipo: SD / SN / Sobreaviso */}
              {!isProducao && (
                <div>
                  <Label>Tipo</Label>
                  <Select value={shiftType} onValueChange={v => { setShiftType(v); if (v === 'sobreaviso') setShiftKind('regular'); }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SD">SD (Diurno)</SelectItem>
                      <SelectItem value="SN">SN (Noturno)</SelectItem>
                      <SelectItem value="sobreaviso">🍅 Sobreaviso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Natureza: Regular / Extra / À Vista */}
              <div className={isProducao ? 'col-span-2' : ''}>
                <Label>Natureza</Label>
                <Select value={shiftKind} onValueChange={setShiftKind}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">🫐 Regular</SelectItem>
                    <SelectItem value="extra">🍌 Extra</SelectItem>
                    <SelectItem value="avista">💵 À Vista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Campo de valor para produção */}
          {isProducao && (
            <div>
              <Label>Valor do Evento (R$) *</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="0,00"
                value={producaoValor}
                onChange={e => setProducaoValor(e.target.value)}
              />
            </div>
          )}

          {!isProducao && !isAvista && !isSobreaviso && hospital && (
            <div>
              <Label>Repetição</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete (plantão único)</SelectItem>
                  <SelectItem value="biweekly">Quinzenal (toda quinzena, indefinidamente)</SelectItem>
                  <SelectItem value="weekly">Semanal (todo semana, indefinidamente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isAvista && hospital && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
              💵 Plantão à vista: um recebível será gerado imediatamente com vencimento no dia do plantão. Ele <strong>não entra</strong> no fechamento do mês.
            </div>
          )}

          {hospital && (bruto > 0 || isProducao) && (
            <div className={`rounded-xl p-3 border ${kindStyle[isSobreaviso ? 'sobreaviso' : shiftKind] || 'bg-accent/30 border-border'}`}>
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
            </div>
          )}

          {repeat !== 'none' && !isSobreaviso && (
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
          <Button
            onClick={handleSave}
            disabled={!hospitalId || (isProducao && !producaoValor)}
            className="flex-1"
          >
            {repeat !== 'none' && !isSobreaviso ? 'Criar Plantões' : 'Criar Plantão'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}