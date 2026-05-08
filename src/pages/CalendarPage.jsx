import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import ShiftModal from '@/components/calendar/ShiftModal';
import CloseMonthModal from '@/components/calendar/CloseMonthModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const kindStyle = {
  regular: 'bg-blue-100 text-blue-800 border-blue-200',
  extra: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  sobreaviso: 'bg-orange-100 text-orange-800 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showClose, setShowClose] = useState(false);
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

  const handleCloseMonth = async (statuses, receivablePreview) => {
    // Atualiza status de cada plantão
    const updates = Object.entries(statuses).map(([id, status]) =>
      updateShiftMutation.mutateAsync({ id, data: { status } })
    );
    await Promise.all(updates);

    // Gera Receivables por hospital
    for (const { hospital, source, total, dueDate, shifts: hshifts } of receivablePreview) {
      const monthLabel = format(currentMonth, 'MMMM/yyyy', { locale: ptBR });
      const rec = await createReceivableMutation.mutateAsync({
        description: `${hospital.sigla} — Plantões ${monthLabel}`,
        amount: total,
        net_amount: total,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        income_source_id: hospital.income_source_id || source?.id || '',
        status: 'pending',
        notes: `Fechamento automático: ${hshifts.length} plantão(s)`,
      });

      // Vincula receivable_id nos plantões do hospital
      for (const s of hshifts) {
        await updateShiftMutation.mutateAsync({ id: s.id, data: { receivable_id: rec.id } });
      }
    }

    queryClient.invalidateQueries();
    setShowClose(false);
    toast.success('Fechamento realizado! Contas a receber geradas.');
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
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[120px] text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => setShowClose(true)}
            disabled={monthShifts.filter(s => s.status === 'scheduled').length === 0}
          >
            <Lock className="w-4 h-4 mr-2" />
            Fechar Mês
          </Button>
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
                    return (
                      <div
                        key={s.id}
                        className={`text-xs px-1.5 py-0.5 rounded border truncate ${kindStyle[s.status === 'cancelled' ? 'cancelled' : s.shift_kind]}`}
                      >
                        {h?.sigla} {s.type}
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
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-200 border border-blue-300" /><span>Regular</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" /><span>Extra</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-200 border border-orange-300" /><span>Sobreaviso</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-200 border border-gray-300" /><span>Cancelado</span></div>
      </div>

      {selectedDate && (
        <ShiftModal
          date={selectedDate}
          hospitals={hospitals}
          onSave={handleSaveShifts}
          onClose={() => setSelectedDate(null)}
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