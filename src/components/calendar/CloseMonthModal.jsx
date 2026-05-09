import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, addMonths, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const kindLabel = { regular: '🫐 Regular', extra: '🍌 Extra', sobreaviso: '🍅 Sobreaviso' };
const kindColor = {
  regular: 'bg-blue-100 text-blue-700',
  extra: 'bg-yellow-100 text-yellow-700',
  sobreaviso: 'bg-red-100 text-red-700',
};

export default function CloseMonthModal({ shifts, hospitals, sources, currentMonth, onClose, onConfirm }) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(shifts.map(s => [s.id, s.status === 'cancelled' ? 'cancelled' : 'done']))
  );

  const toggle = (id) => setStatuses(prev => ({
    ...prev,
    [id]: prev[id] === 'cancelled' ? 'done' : 'cancelled',
  }));

  const doableShifts = shifts.filter(s => statuses[s.id] !== 'cancelled');

  // Agrupar shifts confirmados por hospital
  const byHospital = doableShifts.reduce((acc, s) => {
    if (!acc[s.hospital_id]) acc[s.hospital_id] = [];
    acc[s.hospital_id].push(s);
    return acc;
  }, {});

  // Para cada hospital, calcular recebíveis que serão gerados
  const receivablePreview = Object.entries(byHospital).flatMap(([hid, hshifts]) => {
    const hospital = hospitals.find(h => h.id === hid);
    const source = sources.find(s => s.id === hospital?.income_source_id);
    const isProducao = hospital?.remuneration_model === 'producao';
    const taxRate = source?.default_tax_rate || 0;

    const refDate = currentMonth || new Date(hshifts[0].date + 'T12:00:00');
    const offset = hospital?.payment_months_offset ?? 1;
    const day = hospital?.payment_day || 1;
    const targetMonth = addMonths(startOfMonth(refDate), offset);
    const dueDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);

    const monthLabel = format(refDate, 'MMMM/yyyy', { locale: ptBR });

    if (isProducao) {
      // Produção: um recebível por evento, vencimento = data do evento (D+0)
      return hshifts.map(s => {
        const bruto = s.valor || 0;
        const liquido = taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;
        const eventDate = format(new Date(s.date + 'T12:00:00'), 'dd/MM/yyyy');
        const eventDueDate = new Date(s.date + 'T12:00:00');
        return {
          hospital,
          source,
          total: liquido,
          totalBruto: bruto,
          taxRate,
          dueDate: eventDueDate,
          shifts: [s],
          label: `${hospital.sigla} — Evento ${eventDate}`,
          isPdt: false,
          isProducao: true,
        };
      });
    } else {
      // Plantão: soma todos os shifts do hospital
      const totalBruto = hshifts.reduce((acc, s) => acc + (s.valor || 0), 0);
      const total = taxRate > 0 ? totalBruto * (1 - taxRate / 100) : totalBruto;
      const result = [{
        hospital,
        source,
        total,
        totalBruto,
        taxRate,
        dueDate,
        shifts: hshifts,
        label: `${hospital.sigla} — Plantões ${monthLabel}`,
        isPdt: false,
        isProducao: false,
      }];

      // Se tem produtividade com data separada, adicionar registro PDT zerado
      if (hospital?.has_productivity && hospital?.productivity_separate_date) {
        const pdtDueDate = addDays(dueDate, 15);
        result.push({
          hospital,
          source,
          total: 0,
          totalBruto: 0,
          taxRate: 0,
          dueDate: pdtDueDate,
          shifts: hshifts,
          label: `${hospital.sigla} PDT ${monthLabel}`,
          isPdt: true,
          isProducao: false,
        });
      }

      return result;
    }
  });

  const grandTotal = receivablePreview.reduce((acc, r) => acc + r.total, 0);
  const grandBruto = receivablePreview.reduce((acc, r) => acc + r.totalBruto, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechamento do Mês</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Revise os plantões. Clique para marcar como <strong>cancelado</strong> (não gerará recebível).
          </p>

          {/* Lista de plantões */}
          <div className="space-y-2">
            {shifts.map(s => {
              const hospital = hospitals.find(h => h.id === s.hospital_id);
              const source = sources.find(src => src.id === hospital?.income_source_id);
              const taxRate = source?.default_tax_rate || 0;
              const bruto = s.valor || 0;
              const liquido = taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;
              const cancelled = statuses[s.id] === 'cancelled';
              const isProducao = hospital?.remuneration_model === 'producao';

              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    cancelled ? 'bg-muted/30 border-border opacity-50' : 'bg-card border-border hover:border-primary/30'
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
                      <Badge className={`text-xs py-0 h-4 px-1.5 border-0 ${kindColor[s.shift_kind] || 'bg-gray-100 text-gray-600'}`}>
                        {isProducao ? 'Produção' : `${s.type} ${kindLabel[s.shift_kind]}`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(s.date + 'T12:00:00'), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                    </p>
                  </div>
                  <div className={`text-right ${cancelled ? 'line-through text-muted-foreground' : ''}`}>
                    <p className={`text-sm font-semibold ${cancelled ? '' : 'text-emerald-600'}`}>{fmt(liquido)}</p>
                    {taxRate > 0 && !cancelled && (
                      <p className="text-xs text-muted-foreground">{fmt(bruto)} bruto</p>
                    )}
                  </div>
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
                {receivablePreview.map((r, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${
                      r.isPdt
                        ? 'bg-blue-50 border-blue-200'
                        : r.isProducao
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-semibold ${r.isPdt ? 'text-blue-800' : r.isProducao ? 'text-purple-800' : 'text-emerald-800'}`}>
                        {r.label}
                        {r.isPdt && <span className="ml-2 text-xs font-normal text-blue-600">(PDT — aguarda valor)</span>}
                      </p>
                      <p className={`text-xs mt-0.5 ${r.isPdt ? 'text-blue-600' : r.isProducao ? 'text-purple-600' : 'text-emerald-600'}`}>
                        Vencimento: {format(r.dueDate, 'dd/MM/yyyy')}
                        {r.source && ` · PJ: ${r.source.name}`}
                        {r.taxRate > 0 && ` · ${r.taxRate}% imposto`}
                        {r.isPdt && ' (+15 dias do plantão)'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${r.isPdt ? 'text-blue-400' : r.isProducao ? 'text-purple-700' : 'text-emerald-700'}`}>
                        {r.isPdt ? 'R$ —' : fmt(r.total)}
                      </p>
                      {r.taxRate > 0 && !r.isPdt && (
                        <p className={`text-xs ${r.isProducao ? 'text-purple-500' : 'text-emerald-500'}`}>{fmt(r.totalBruto)} bruto</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold">Total a Receber</span>
            <div className="text-right">
              <p className="text-xl font-bold text-primary">{fmt(grandTotal)}</p>
              {receivablePreview.some(r => r.taxRate > 0) && (
                <p className="text-xs text-muted-foreground">{fmt(grandBruto)} bruto</p>
              )}
            </div>
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