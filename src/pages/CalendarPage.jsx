import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import ShiftModal from '@/components/calendar/ShiftModal';
import CloseMonthModal from '@/components/calendar/CloseMonthModal';
import ShiftDetailModal from '@/components/calendar/ShiftDetailModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Mirtilo=Azul, Banana=Amarelo, Tomate=Vermelho, Grafite=Cinza
const kindStyle = {
  regular: 'bg-blue-100 text-blue-800 border-blue-200',
  extra: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  sobreaviso: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-200 text-gray-500 border-gray-300 line-through',
  passed: 'bg-gray-200 text-gray-500 border-gray-300 italic',
  producao: 'bg-purple-100 text-purple-800 border-purple-200',
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [showClose, setShowClose] = useState(false);
  const [reopening, setReopening] = useState(false);
  const queryClient = useQueryClient();

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: hospitals = [] } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => base44.entities.Hospital.list(),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', monthStart],
    queryFn: () => base44.entities.Shift.filter({ date: { $gte: monthStart, $lte: monthEnd } }, 'date'),
  });

  const createShiftsMutation = useMutation({
    mutationFn: (shiftList) => base44.entities.Shift.bulkCreate(shiftList),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shifts'] }); toast.success('Plantão(s) criado(s)!'); },
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Shift.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const createReceivableMutation = useMutation({
    mutationFn: (data) => base44.entities.Receivable.create(data),
  });

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDow = getDay(days[0]); // 0=dom

  const shiftsOnDate = (date) => {
    const d = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === d);
  };

  const monthShifts = shifts.filter(s => s.date >= monthStart && s.date <= monthEnd);
  const totalMonth = monthShifts.filter(s => s.status !== 'cancelled').reduce((acc, s) => acc + (s.valor || 0), 0);

  const handleSaveShifts = (newShifts) => {
    createShiftsMutation.mutate(newShifts);
    setSelectedDate(null);
  };

  const handleCancelShift = (id) => {
    updateShiftMutation.mutate({ id, data: { status: 'cancelled' } });
  };

  const handlePassShift = (id, data) => {
    updateShiftMutation.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['shifts'] });
        setSelectedShift(null);
        toast.success('Plantão marcado como passado!');
      }
    });
  };

  const handleDeleteFromHere = async (shift) => {
    // Busca todos os shifts futuros (inclusive além do mês visível)
    const allFuture = await base44.entities.Shift.filter({
      hospital_id: shift.hospital_id,
      type: shift.type,
      shift_kind: shift.shift_kind,
      date: { $gte: shift.date },
      status: 'scheduled',
    });
    // Deleta apenas os que NÃO têm recebível vinculado (ou seja, não foram fechados/pagos)
    const toDelete = allFuture.filter(s => !s.receivable_id);
    await Promise.all(toDelete.map(s => base44.entities.Shift.delete(s.id)));
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    setSelectedShift(null);
    toast.success(`${toDelete.length} plantão(s) futuro(s) deletado(s). Recebíveis preservados.`);
  };

  // Reabrir mês: verifica pagamentos já realizados antes de reverter
  const handleReopenMonth = async () => {
    setReopening(true);
    try {
      const closedShifts = monthShifts.filter(s => s.status === 'done' && s.receivable_id);
      const receivableIds = [...new Set(closedShifts.map(s => s.receivable_id).filter(Boolean))];

      // Busca os recebíveis vinculados para checar se já foram pagos
      const receivables = await Promise.all(receivableIds.map(id => base44.entities.Receivable.filter({ id })));
      const flatReceivables = receivables.flat();
      const paidReceivables = flatReceivables.filter(r => r.status === 'received' || r.transaction_id);

      if (paidReceivables.length > 0) {
        const names = paidReceivables.map(r => `• ${r.description}`).join('\n');
        const ok = window.confirm(
          `⚠️ Atenção! ${paidReceivables.length} conta(s) a receber já foram marcadas como pagas:\n\n${names}\n\nReabrir o mês irá deletar essas contas E os lançamentos de receita vinculados.\n\nDeseja continuar mesmo assim?`
        );
        if (!ok) { setReopening(false); return; }

        // Deleta os lançamentos de receita vinculados aos recebíveis pagos
        const txIds = paidReceivables.map(r => r.transaction_id).filter(Boolean);
        await Promise.all(txIds.map(id => base44.entities.Transaction.delete(id)));
      } else {
        const ok = window.confirm('Isso irá reverter todos os plantões fechados para "agendado" e deletar as contas a receber geradas no fechamento. Confirmar?');
        if (!ok) { setReopening(false); return; }
      }

      // Reverte plantões para scheduled
      await Promise.all(closedShifts.map(s =>
        base44.entities.Shift.update(s.id, { status: 'scheduled', receivable_id: null })
      ));
      // Deleta os recebíveis
      await Promise.all(receivableIds.map(id => base44.entities.Receivable.delete(id)));
      await queryClient.invalidateQueries();
      toast.success(`Mês reaberto! ${closedShifts.length} plantão(s) revertido(s) e ${receivableIds.length} conta(s) a receber removida(s).`);
    } finally {
      setReopening(false);
    }
  };

  const handleCloseMonth = async (statuses, receivablePreview) => {
    // Atualiza apenas os plantões que estavam como 'scheduled' (não mexe em cancelados/passados já existentes)
    const updates = Object.entries(statuses)
      .filter(([id]) => {
        const shift = monthShifts.find(s => s.id === id);
        return shift?.status === 'scheduled';
      })
      .map(([id, status]) => updateShiftMutation.mutateAsync({ id, data: { status } }));
    await Promise.all(updates);

    // Gera Receivables usando exatamente o receivablePreview (já filtrado sem cancelados)
    for (const { hospital, source, label, total, totalBruto, taxRate, dueDate, shifts: hshifts, isPdt } of receivablePreview) {
      const rec = await createReceivableMutation.mutateAsync({
        description: label,
        amount: isPdt ? 0 : totalBruto,
        net_amount: isPdt ? 0 : total,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        competencia: format(startOfMonth(new Date(hshifts[0].date + 'T12:00:00')), 'yyyy-MM-dd'),
        income_source_id: hospital.income_source_id || source?.id || '',
        tax_rate: isPdt ? 0 : (taxRate || 0),
        status: 'pending',
        notes: isPdt
          ? `PDT — aguardando valor (${hshifts.length} plantão(s))`
          : `Fechamento automático: ${hshifts.length} plantão(s)`,
      });

      // Vincula receivable_id apenas nos plantões confirmados (done), não nos cancelados/passados
      await Promise.all(
        hshifts
          .filter(s => statuses[s.id] === 'done')
          .map(s => updateShiftMutation.mutateAsync({ id: s.id, data: { receivable_id: rec.id } }))
      );
    }

    await queryClient.invalidateQueries();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-sora font-bold">Calendário de Plantões</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthShifts.filter(s => s.status !== 'cancelled').length} plantão(s) · {fmt(totalMonth)} previsto
          </p>
        </div>
        <div className="flex items-center gap-2">
          {monthShifts.some(s => s.status === 'done' && s.receivable_id) && (
            <Button
              variant="outline"
              onClick={handleReopenMonth}
              disabled={reopening}
            >
              <LockOpen className="w-4 h-4 mr-2" />
              {reopening ? 'Revertendo...' : 'Reabrir Mês'}
            </Button>
          )}
          <Button
            onClick={() => setShowClose(true)}
            disabled={monthShifts.filter(s => s.status === 'scheduled').length === 0}
          >
            <Lock className="w-4 h-4 mr-2" />
            Fechar Mês
          </Button>
          <div className="flex items-center gap-1 ml-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[120px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Grade do calendário */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Cabeçalho dias da semana */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Células dos dias */}
        <div className="grid grid-cols-7">
          {/* Células vazias antes do primeiro dia */}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] md:min-h-[100px] border-r border-b border-border bg-muted/20" />
          ))}

          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayShifts = shiftsOnDate(day);
            const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
            const isSunday = getDay(day) === 0;
            const isSaturday = getDay(day) === 6;

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`min-h-[80px] md:min-h-[100px] border-r border-b border-border p-1.5 cursor-pointer transition-colors hover:bg-accent/30 ${
                  isSunday || isSaturday ? 'bg-muted/10' : ''
                }`}
              >
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                }`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayShifts.slice(0, 3).map(s => {
                    const h = hospitals.find(h => h.id === s.hospital_id);
                    const styleKey = s.status === 'cancelled' ? 'cancelled' : s.status === 'passed' ? 'passed' : s.shift_kind;
                    const hospital = h;
                    const isProducao = hospital?.remuneration_model === 'producao';
                    const displayStyle = isProducao && styleKey !== 'cancelled' && styleKey !== 'passed'
                      ? kindStyle.producao
                      : kindStyle[styleKey];
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedShift(s); }}
                        className={`text-xs px-1.5 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 ${displayStyle}`}
                      >
                        {h?.sigla} {isProducao ? '📊' : s.type}
                        {s.status === 'passed' && ' ↗'}
                      </div>
                    );
                  })}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-muted-foreground pl-1">+{dayShifts.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-200 border border-blue-300" /><span>🫐 Regular</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" /><span>🍌 Extra</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-200 border border-red-300" /><span>🍅 Sobreaviso</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-200 border border-purple-300" /><span>📊 Produção</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-300 border border-gray-400" /><span>🩶 Cancelado / Passado</span></div>
      </div>

      {selectedDate && (
        <ShiftModal
          date={selectedDate}
          hospitals={hospitals}
          sources={sources}
          existingShifts={shifts.filter(s => s.date === selectedDate)}
          onSave={handleSaveShifts}
          onCancelShift={handleCancelShift}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          hospital={hospitals.find(h => h.id === selectedShift.hospital_id)}
          source={sources.find(s => s.id === hospitals.find(h => h.id === selectedShift.hospital_id)?.income_source_id)}
          onClose={() => setSelectedShift(null)}
          onPass={handlePassShift}
          onDeleteFromHere={handleDeleteFromHere}
        />
      )}

      {showClose && (
        <CloseMonthModal
          shifts={monthShifts}
          hospitals={hospitals}
          sources={sources}
          currentMonth={currentMonth}
          onClose={() => setShowClose(false)}
          onConfirm={handleCloseMonth}
        />
      )}
    </div>
  );
}