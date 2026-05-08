import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const kindLabel = { regular: 'Regular', extra: 'Extra', sobreaviso: 'Sobreaviso' };
const kindColor = {
  regular: 'bg-blue-100 text-blue-700',
  extra: 'bg-yellow-100 text-yellow-700',
  sobreaviso: 'bg-orange-100 text-orange-700',
};

export default function CloseMonthModal({ shifts, hospitals, sources, onClose, onConfirm }) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(shifts.map(s => [s.id, s.status === 'cancelled' ? 'cancelled' : 'done']))
  );

  const toggle = (id) => setStatuses(prev => ({
    ...prev,
    [id]: prev[id] === 'cancelled' ? 'done' : 'cancelled',
  }));

  const doableShifts = shifts.filter(s => statuses[s.id] !== 'cancelled');
  const totalValue = doableShifts.reduce((acc, s) => acc + (s.valor || 0), 0);

  // Agrupar por hospital para gerar um Receivable por hospital
  const byHospital = doableShifts.reduce((acc, s) => {
    if (!acc[s.hospital_id]) acc[s.hospital_id] = [];
    acc[s.hospital_id].push(s);
    return acc;
  }, {});

  const receivablePreview = Object.entries(byHospital).map(([hid, hshifts]) => {
    const hospital = hospitals.find(h => h.id === hid);
    const source = sources.find(s => s.id === hospital?.income_source_id);
    const total = hshifts.reduce((acc, s) => acc + (s.valor || 0), 0);
    // Due date = última data do plantão + dias de atraso
    const lastDate = hshifts.map(s => s.date).sort().at(-1);
    const dueDate = addDays(new Date(lastDate + 'T12:00:00'), hospital?.dias_atraso || 0);
    return { hospital, source, total, dueDate, shifts: hshifts };
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechamento do Mês</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Revise os plantões abaixo. Clique em um para marcar como <strong>cancelado</strong> (não gerará recebível).
          </p>

          {/* Lista de plantões */}
          <div className="space-y-2">
            {shifts.map(s => {
              const hospital = hospitals.find(h => h.id === s.hospital_id);
              const cancelled = statuses[s.id] === 'cancelled';
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    cancelled
                      ? 'bg-muted/30 border-border opacity-50'
                      : 'bg-card border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {cancelled
                      ? <XCircle className="w-5 h-5 text-red-400" />
                      : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{hospital?.sigla}</span>
                      <Badge className={`text-xs py-0 h-4 px-1.5 border-0 ${kindColor[s.shift_kind]}`}>
                        {s.type} {kindLabel[s.shift_kind]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(s.date + 'T12:00:00'), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${cancelled ? 'line-through text-muted-foreground' : 'text-emerald-600'}`}>
                    {fmt(s.valor)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Preview de recebíveis */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Contas a Receber que serão geradas
            </p>
            {receivablePreview.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum plantão confirmado.</p>
            ) : (
              <div className="space-y-2">
                {receivablePreview.map(({ hospital, source, total, dueDate }) => (
                  <div key={hospital?.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">{hospital?.name}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Vencimento: {format(dueDate, 'dd/MM/yyyy')}
                        {source && ` · PJ: ${source.name}`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">{fmt(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold">Total a Receber</span>
            <span className="text-lg font-bold text-primary">{fmt(totalValue)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={() => onConfirm(statuses, receivablePreview)}
            disabled={doableShifts.length === 0}
            className="flex-1"
          >
            Confirmar Fechamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}