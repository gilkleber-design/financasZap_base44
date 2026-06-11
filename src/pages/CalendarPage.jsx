import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Lock, LockOpen, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ShiftModal from '@/components/calendar/ShiftModal';
import CloseMonthModal from '@/components/calendar/CloseMonthModal';
import ReopenMonthModal from '@/components/calendar/ReopenMonthModal';
import ShiftDetailModal from '@/components/calendar/ShiftDetailModal';
import MonthlyHospitalSummary from '@/components/calendar/MonthlyHospitalSummary';
import { calculateShiftValue } from '@/lib/shifts';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Mirtilo=Azul, Banana=Amarelo, Tomate=Vermelho, Grafite=Cinza, Verde=À Vista
const kindStyle = {
  regular: 'bg-blue-100 text-blue-800 border-blue-200',
  extra: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  sobreaviso: 'bg-red-100 text-red-800 border-red-200',
  avista: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-200 text-gray-500 border-gray-300 line-through',
  passed: 'bg-gray-200 text-gray-500 border-gray-300 italic',
  producao: 'bg-purple-100 text-purple-800 border-purple-200',
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [showClose, setShowClose] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false); // confirmação de reabrir mês
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

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables', monthStart],
    queryFn: () => base44.entities.Receivable.filter({ competencia: { $gte: monthStart, $lte: monthEnd } }),
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
  
  const totalMonth = monthShifts
    .filter(s => s.status !== 'cancelled')
    .reduce((acc, s) => {
      const hospital = hospitals.find(h => h.id === s.hospital_id);
      const source = hospital ? sources.find(src => src.id === hospital.income_source_id) : null;
      const taxRate = source?.default_tax_rate || 0;
      const bruto = s.valor || 0;
      const liquido = taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;
      return acc + liquido;
    }, 0);

  const monthlyHospitalSummary = useMemo(() => {
    const summaryMap = new Map();

    monthShifts
      .filter((shift) => shift.status !== 'cancelled')
      .forEach((shift) => {
        const hospital = hospitals.find((item) => item.id === shift.hospital_id);
        if (!hospital) return;

        const source = sources.find((item) => item.id === hospital.income_source_id);
        const taxRate = Number(source?.default_tax_rate || 0);
        const grossAmount = Number(shift.valor || 0);
        const netAmount = taxRate > 0 ? grossAmount * (1 - taxRate / 100) : grossAmount;
        const current = summaryMap.get(hospital.id) || {
          hospitalId: hospital.id,
          hospitalName: hospital.name,
          shiftCount: 0,
          netAmount: 0,
        };

        current.shiftCount += 1;
        current.netAmount += netAmount;
        summaryMap.set(hospital.id, current);
      });

    const items = Array.from(summaryMap.values()).sort((a, b) => b.netAmount - a.netAmount || b.shiftCount - a.shiftCount || a.hospitalName.localeCompare(b.hospitalName, 'pt-BR'));

    return {
      items,
      totalShifts: items.reduce((sum, item) => sum + item.shiftCount, 0),
      totalAmount: items.reduce((sum, item) => sum + item.netAmount, 0),
    };
  }, [monthShifts, hospitals, sources]);

  const monthNumber = currentMonth.getMonth() + 1;
  const yearNumber = currentMonth.getFullYear();

  const { data: closure } = useQuery({
    queryKey: ['monthly_closure', monthNumber, yearNumber],
    queryFn: () => base44.entities.MonthlyClosure.filter({ month: monthNumber, year: yearNumber }),
  });
  const isMonthClosed = closure?.[0]?.status === 'closed';

  const handleSaveShifts = async (newShifts, meta) => {
    if (meta?.isAvista && newShifts.length === 1) {
      let shiftId = null;
      try {
        const [shiftData] = newShifts;
        const shift = await base44.entities.Shift.create(shiftData);
        shiftId = shift.id;
        const { hospital, source, bruto, liquido, taxRate, date } = meta;
        const categories = await base44.entities.Category.filter({ slug: 'plantoes' });
        const plantaoCategory = categories?.[0] || null;
        const rec = await base44.entities.Receivable.create({
          description: `${hospital.sigla} — À Vista ${format(new Date(date + 'T12:00:00'), 'dd/MM/yyyy')}`,
          amount: bruto || 0,
          net_amount: liquido || bruto || 0,
          due_date: date,
          competencia: format(startOfMonth(new Date(date + 'T12:00:00')), 'yyyy-MM-dd'),
          income_source_id: hospital.income_source_id || '',
          hospital_id: hospital.id,
          category: 'plantoes',
          category_id: plantaoCategory?.id,
          tax_rate: taxRate || undefined,
          status: 'pending',
          receivable_type: 'avista',
          source_shift_ids: [shift.id],
          notes: `Plantão à vista`,
        });
        await base44.entities.Shift.update(shift.id, { receivable_id: rec.id });
        queryClient.invalidateQueries({ queryKey: ['shifts'] });
        queryClient.invalidateQueries({ queryKey: ['receivables'] });
        toast.success('Plantão à vista criado! Conta a receber gerada.');
      } catch (err) {
        if (shiftId) await base44.entities.Shift.delete(shiftId);
        toast.error('Erro ao salvar plantão à vista: ' + err.message);
      }
    } else {
      createShiftsMutation.mutate(newShifts);
    }
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

  const handleDeleteScope = async (shift, scope) => {
    let toDelete = [];
    if (scope === 'only_this') {
      toDelete = [shift];
    } else {
      const filterParams = {
        hospital_id: shift.hospital_id,
        type: shift.type,
        shift_kind: shift.shift_kind,
        status: 'scheduled',
      };
      if (scope === 'from_here') {
        filterParams.date = { $gte: shift.date };
      }
      const allMatches = await base44.entities.Shift.filter(filterParams);
      toDelete = allMatches.filter(s => !s.receivable_id);
    }

    await Promise.all(toDelete.map(s => base44.entities.Shift.delete(s.id)));
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    setSelectedShift(null);
    toast.success(`${toDelete.length} plantão(s) deletado(s). Recebíveis preservados.`);
  };

  const handleUpdateScope = async (originalShift, updatedData, scope, hospital) => {
    let toUpdate = [];
    if (scope === 'only_this') {
      toUpdate = [originalShift];
    } else {
      const filterParams = {
        hospital_id: originalShift.hospital_id,
        type: originalShift.type,
        shift_kind: originalShift.shift_kind,
        status: 'scheduled',
      };
      if (scope === 'from_here') {
        filterParams.date = { $gte: originalShift.date };
      }
      const allMatches = await base44.entities.Shift.filter(filterParams);
      toUpdate = allMatches.filter(s => !s.receivable_id);
    }

    await Promise.all(toUpdate.map(s => {
      const valResult = calculateShiftValue({
        hospital,
        shiftDate: s.date,
        type: updatedData.type,
        isTurno: updatedData.is_turno,
        valorProducao: updatedData.valor_producao
      });
      const finalData = { ...updatedData, valor: valResult.value };
      return base44.entities.Shift.update(s.id, finalData);
    }));

    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    setEditingShift(null);
    toast.success(`${toUpdate.length} plantão(s) atualizado(s).`);
  };

  // Reabertura e Fechamento agora são gerenciados pelos novos modais e backend functions.

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
          {isMonthClosed ? (
            <Button
              variant="outline"
              onClick={() => setConfirmReopen(true)}
              disabled={reopening}
            >
              <LockOpen className="w-4 h-4 mr-2" />
              {reopening ? 'Revertendo...' : 'Reabrir Mês'}
            </Button>
          ) : (
            <Button
              onClick={() => setShowClose(true)}
              disabled={monthShifts.filter(s => s.status === 'scheduled').length === 0}
            >
              <Lock className="w-4 h-4 mr-2" />
              Fechar Mês
            </Button>
          )}
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
                    const isProducao = hospital?.payment_model === 'so_producao' || hospital?.remuneration_model === 'producao';
                    const isAvista = s.is_avista || s.shift_kind === 'avista';
                    const displayStyle = isAvista && styleKey !== 'cancelled'
                      ? kindStyle.avista
                      : isProducao && styleKey !== 'cancelled' && styleKey !== 'passed'
                      ? kindStyle.producao
                      : kindStyle[styleKey];
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedShift(s); }}
                        className={`text-xs px-1.5 py-0.5 rounded border truncate flex items-center gap-1 cursor-pointer hover:opacity-80 ${displayStyle}`}
                      >
                        {s.status === 'done' && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">
                          {h?.sigla} {s.type}
                          {s.status === 'passed' && ' ↗'}
                        </span>
                        {s.is_turno && styleKey !== 'cancelled' && (
                          <span className="text-[9px] font-bold bg-black/10 text-black/60 px-1 rounded-sm flex-shrink-0" title="Turno (meio plantão)">½</span>
                        )}
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

      <MonthlyHospitalSummary
        items={monthlyHospitalSummary.items}
        totalShifts={monthlyHospitalSummary.totalShifts}
        totalAmount={monthlyHospitalSummary.totalAmount}
      />

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs">
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-200 border border-blue-300" /><span>Regular</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" /><span>Extra</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-200 border border-red-300" /><span>Sobreaviso</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-200 border border-purple-300" /><span>Produção</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-200 border border-green-300" /><span>À Vista</span></div>
      <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-300 border border-gray-400" /><span>Cancelado / Passado</span></div>
      <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-600" /><span>Realizado</span></div>
      <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold bg-black/10 text-black/60 px-1 rounded-sm">½</span><span>Turno</span></div>
      </div>

      {(selectedDate || editingShift) && (
        <ShiftModal
          date={selectedDate}
          editingShift={editingShift}
          hospitals={hospitals}
          sources={sources}
          existingShifts={selectedDate ? shifts.filter(s => s.date === selectedDate) : []}
          onSave={handleSaveShifts}
          onUpdateScope={handleUpdateScope}
          onCancelShift={handleCancelShift}
          onClose={() => { setSelectedDate(null); setEditingShift(null); }}
        />
      )}

      {selectedShift && (
        <ShiftDetailModal
          shift={selectedShift}
          hospital={hospitals.find(h => h.id === selectedShift.hospital_id)}
          source={sources.find(s => s.id === hospitals.find(h => h.id === selectedShift.hospital_id)?.income_source_id)}
          onClose={() => setSelectedShift(null)}
          onPass={handlePassShift}
          onDeleteScope={handleDeleteScope}
          onEdit={(shift) => { setEditingShift(shift); setSelectedShift(null); }}
        />
      )}

      {confirmReopen && (
        <ReopenMonthModal
          monthStart={currentMonth}
          onClose={() => setConfirmReopen(false)}
          onReopened={() => {
            setConfirmReopen(false);
            queryClient.invalidateQueries();
          }}
        />
      )}

      {showClose && (
        <CloseMonthModal
          monthStart={currentMonth}
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false);
            queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}