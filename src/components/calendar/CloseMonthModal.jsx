import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null); // { count, total }
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(shifts.map(s => [
      s.id,
      (s.status === 'cancelled' || s.status === 'passed' || s.shift_kind === 'avista') ? s.status : 'done'
    ]))
  );
  const [extraIncomes, setExtraIncomes] = useState([]);
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraForm, setExtraForm] = useState({ description: '', amount: '', taxRate: '', sourceId: '' });

  const toggle = (id) => {
    const shift = shifts.find(s => s.id === id);
    // Não permite alterar plantões que já eram passed/avista antes do fechamento
    if (shift?.status === 'passed' || shift?.shift_kind === 'avista') return;
    setStatuses(prev => ({
      ...prev,
      [id]: prev[id] === 'cancelled' ? 'done' : 'cancelled',
    }));
  };

  const doableShifts = shifts.filter(s => s.shift_kind !== 'avista' && statuses[s.id] === 'done');

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

  const addExtraIncome = () => {
    if (!extraForm.description || !extraForm.amount) return;
    const amount = parseFloat(extraForm.amount);
    const taxRate = parseFloat(extraForm.taxRate) || 0;
    const netAmount = taxRate > 0 ? amount * (1 - taxRate / 100) : amount;
    setExtraIncomes([...extraIncomes, { ...extraForm, amount, taxRate, netAmount }]);
    setExtraForm({ description: '', amount: '', taxRate: '', sourceId: '' });
    setShowExtraForm(false);
  };

  const removeExtraIncome = (idx) => {
    setExtraIncomes(extraIncomes.filter((_, i) => i !== idx));
  };

  const extraIncomesPreview = extraIncomes.map(ei => ({
    description: ei.description,
    total: ei.netAmount,
    totalBruto: ei.amount,
    taxRate: ei.taxRate,
    dueDate: currentMonth ? addMonths(startOfMonth(currentMonth), 1) : new Date(),
    label: ei.description,
    isPdt: false,
    isProducao: false,
    isExtra: true,
    sourceId: ei.sourceId,
  }));

  const allReceivables = [...receivablePreview, ...extraIncomesPreview];
  const grandTotal = allReceivables.reduce((acc, r) => acc + r.total, 0);
  const grandBruto = allReceivables.reduce((acc, r) => acc + r.totalBruto, 0);

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

          {/* Lista de plantões — excluindo os "à vista" que já têm recebível próprio e os já passados */}
          <div className="space-y-2">
            {shifts.filter(s => s.shift_kind !== 'avista' && s.status !== 'passed').map(s => {
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

          {/* Seção de receitas extras */}
          <div className="border-t border-border pt-4">
           <div className="flex items-center justify-between mb-3">
             <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
               Receitas Extras
             </p>
             <Button
               variant="ghost"
               size="sm"
               onClick={() => setShowExtraForm(!showExtraForm)}
               className="text-xs h-6"
             >
               {showExtraForm ? '✕' : '+ Adicionar'}
             </Button>
           </div>

           {showExtraForm && (
             <div className="bg-accent/30 border border-border rounded-xl p-3 space-y-3 mb-3">
               <input
                 type="text"
                 placeholder="Descrição (ex: Bolsa Internato)"
                 value={extraForm.description}
                 onChange={e => setExtraForm({ ...extraForm, description: e.target.value })}
                 className="w-full px-2 py-1.5 text-sm rounded border border-input bg-background"
               />
               <div className="grid grid-cols-3 gap-2">
                 <input
                   type="number"
                   placeholder="Valor"
                   value={extraForm.amount}
                   onChange={e => setExtraForm({ ...extraForm, amount: e.target.value })}
                   className="px-2 py-1.5 text-sm rounded border border-input bg-background"
                 />
                 <input
                   type="number"
                   placeholder="Imposto %"
                   value={extraForm.taxRate}
                   onChange={e => setExtraForm({ ...extraForm, taxRate: e.target.value })}
                   className="px-2 py-1.5 text-sm rounded border border-input bg-background"
                 />
                 <Button size="sm" onClick={addExtraIncome} className="h-8">Adicionar</Button>
               </div>
             </div>
           )}

           {extraIncomes.length > 0 && (
             <div className="space-y-2 mb-3">
               {extraIncomes.map((ei, idx) => (
                 <div key={idx} className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center justify-between gap-3">
                   <div>
                     <p className="text-sm font-semibold text-violet-800">{ei.description}</p>
                     <p className="text-xs text-violet-600">{ei.taxRate > 0 ? `${ei.taxRate}% imposto` : 'Sem imposto'}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-sm font-bold text-violet-700">{fmt(ei.netAmount)}</p>
                     {ei.taxRate > 0 && <p className="text-xs text-violet-500">{fmt(ei.amount)} bruto</p>}
                   </div>
                   <button
                     onClick={() => removeExtraIncome(idx)}
                     className="text-red-500 hover:text-red-700 text-xs underline"
                   >
                     Remover
                   </button>
                 </div>
               ))}
             </div>
           )}
          </div>

          {/* Preview de recebíveis */}
          <div className="border-t border-border pt-4">
           <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
             Contas a Receber que serão geradas
           </p>
           {allReceivables.length === 0 ? (
             <p className="text-sm text-muted-foreground text-center py-3">Nenhuma receita para confirmar.</p>
           ) : (
             <div className="space-y-2">
               {allReceivables.map((r, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${
                      r.isExtra
                        ? 'bg-violet-50 border-violet-200'
                        : r.isPdt
                        ? 'bg-blue-50 border-blue-200'
                        : r.isProducao
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-semibold ${
                        r.isExtra ? 'text-violet-800' : r.isPdt ? 'text-blue-800' : r.isProducao ? 'text-purple-800' : 'text-emerald-800'
                      }`}>
                        {r.label}
                        {r.isExtra && <span className="ml-2 text-xs font-normal text-violet-600">(Receita Extra)</span>}
                        {r.isPdt && <span className="ml-2 text-xs font-normal text-blue-600">(PDT — aguarda valor)</span>}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        r.isExtra ? 'text-violet-600' : r.isPdt ? 'text-blue-600' : r.isProducao ? 'text-purple-600' : 'text-emerald-600'
                      }`}>
                        {!r.isExtra && `Vencimento: ${format(r.dueDate, 'dd/MM/yyyy')}`}
                        {r.source && ` · PJ: ${r.source.name}`}
                        {r.taxRate > 0 && ` · ${r.taxRate}% imposto`}
                        {r.isPdt && ' (+15 dias do plantão)'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${
                        r.isExtra ? 'text-violet-700' : r.isPdt ? 'text-blue-400' : r.isProducao ? 'text-purple-700' : 'text-emerald-700'
                      }`}>
                        {r.isPdt ? 'R$ —' : fmt(r.total)}
                      </p>
                      {r.taxRate > 0 && !r.isPdt && (
                        <p className={`text-xs ${r.isExtra ? 'text-violet-500' : r.isProducao ? 'text-purple-500' : 'text-emerald-500'}`}>{fmt(r.totalBruto)} bruto</p>
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

        {done ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700">Fechamento realizado com sucesso!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {done.count} conta(s) a receber gerada(s) · {fmt(done.total)} líquido
              </p>
            </div>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">Cancelar</Button>
            <Button
              onClick={async () => {
                setLoading(true);
                await onConfirm(statuses, allReceivables);
                setDone({ count: allReceivables.length, total: grandTotal });
                setLoading(false);
              }}
              disabled={allReceivables.length === 0 || loading}
              className="flex-1"
            >
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</> : 'Confirmar Fechamento'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}