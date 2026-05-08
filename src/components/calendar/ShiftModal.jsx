import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, addWeeks, eachWeekOfInterval, addMonths, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function calcValor(hospital, date, shiftType, shiftKind) {
  if (shiftKind === 'sobreaviso') return hospital.valor_sobreaviso || 0;
  const dow = new Date(date + 'T12:00:00').getDay(); // 0=dom,6=sab
  const isFds = dow === 0 || dow === 6;
  if (shiftType === 'SD') return isFds ? (hospital.valor_sd_fds || 0) : (hospital.valor_sd_semana || 0);
  return isFds ? (hospital.valor_sn_fds || 0) : (hospital.valor_sn_semana || 0);
}

export default function ShiftModal({ date, hospitals, onSave, onClose }) {
  const [hospitalId, setHospitalId] = useState('');
  const [shiftType, setShiftType] = useState('SD');
  const [shiftKind, setShiftKind] = useState('regular');
  const [repeat, setRepeat] = useState('none');

  const hospital = hospitals.find(h => h.id === hospitalId);
  const valor = hospital ? calcValor(hospital, date, shiftType, shiftKind) : 0;

  const handleSave = () => {
    if (!hospitalId) return;

    const shifts = [];
    const base = { hospital_id: hospitalId, type: shiftType, shift_kind: shiftKind, status: 'scheduled' };
    const startDate = new Date(date + 'T12:00:00');

    const addShift = (d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      shifts.push({ ...base, date: dateStr, valor: calcValor(hospital, dateStr, shiftType, shiftKind) });
    };

    if (repeat === 'none') {
      addShift(startDate);
    } else if (repeat === 'biweekly') {
      // Apenas hoje + daqui 2 semanas
      addShift(startDate);
      addShift(addWeeks(startDate, 2));
    } else if (repeat === 'weekly') {
      // Semanal indefinido: gera 24 meses à frente
      const endDate = addMonths(startDate, 24);
      let current = startDate;
      while (current <= endDate) {
        addShift(current);
        current = addWeeks(current, 1);
      }
    }

    onSave(shifts);
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={shiftType} onValueChange={setShiftType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SD">SD (Diurno)</SelectItem>
                  <SelectItem value="SN">SN (Noturno)</SelectItem>
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
                  <SelectItem value="sobreaviso">Sobreaviso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Repetição</Label>
            <Select value={repeat} onValueChange={setRepeat}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não repete (plantão único)</SelectItem>
                <SelectItem value="biweekly">Quinzenal (hoje + daqui 2 semanas)</SelectItem>
                <SelectItem value="weekly">Semanal (todo semana, indefinidamente)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hospital && (
            <div className="bg-accent/30 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor calculado</span>
              <span className="font-bold text-emerald-600 text-lg">{fmt(valor)}</span>
            </div>
          )}

          {repeat !== 'none' && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              {repeat === 'weekly'
                ? 'Serão criados ~104 plantões (toda semana pelos próximos 2 anos). Cancele individualmente os que não ocorrerem.'
                : 'Serão criados 2 plantões (hoje + daqui a 2 semanas).'}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={!hospitalId} className="flex-1">
            {repeat !== 'none' ? 'Criar Plantões' : 'Criar Plantão'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}