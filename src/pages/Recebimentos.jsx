import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, ChevronLeft, ChevronRight, Download, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import DashboardLogo from '@/components/dashboard/DashboardLogo';
import ReceivablesPipelineCard from '@/components/dashboard/ReceivablesPipelineCard';
import { getInitials, formatCurrency } from '@/components/dashboard/financaszapTheme';
import { Button } from '@/components/ui/button';

const RANGE_OPTIONS = [1, 3, 6, 12];

function getStoredMonth() {
  const value = localStorage.getItem('receb_mes');
  return value ? new Date(`${value}-01T12:00:00`) : new Date();
}

function getStoredRange() {
  return Number(localStorage.getItem('receb_intervalo') || 3);
}

export default function Recebimentos() {
  const [anchorMonth, setAnchorMonth] = useState(getStoredMonth);
  const [range, setRange] = useState(getStoredRange);
  const now = new Date();

  useEffect(() => {
    localStorage.setItem('receb_mes', format(anchorMonth, 'yyyy-MM'));
  }, [anchorMonth]);

  useEffect(() => {
    localStorage.setItem('receb_intervalo', String(range));
  }, [range]);

  const months = useMemo(() => Array.from({ length: range }, (_, index) => subMonths(anchorMonth, range - 1 - index)), [anchorMonth, range]);
  const monthKeys = useMemo(() => months.map((date) => format(date, 'yyyy-MM')), [months]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: receivables = [] } = useQuery({ queryKey: ['recebimentos-receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 1000) });
  const { data: hospitals = [] } = useQuery({ queryKey: ['recebimentos-hospitals'], queryFn: () => base44.entities.Hospital.list('name', 500) });
  const { data: incomeSources = [] } = useQuery({ queryKey: ['recebimentos-income-sources'], queryFn: () => base44.entities.IncomeSource.list('name', 500) });

  const data = useMemo(() => {
    const todayKey = format(now, 'yyyy-MM-dd');
    const filteredReceivables = receivables.filter((item) => monthKeys.includes((item.competencia || item.due_date || '').slice(0, 7)));

    const pipelineRows = hospitals
      .filter((hospital) => hospital.active !== false)
      .map((hospital) => {
        const hospitalMatchers = [hospital.sigla, hospital.name]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());

        const hospitalReceivables = filteredReceivables.filter((item) => {
          const description = String(item.description || '').trim().toLowerCase();
          return hospitalMatchers.some((matcher) => {
            if (!matcher) return false;
            const escapedMatcher = matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(^|[^a-z0-9])${escapedMatcher}([^a-z0-9]|$)`);
            return pattern.test(description);
          });
        });

        const cells = months.map((date) => {
          const key = format(date, 'yyyy-MM');
          const receivableMatches = hospitalReceivables.filter((item) => (item.competencia || item.due_date || '').slice(0, 7) === key);
          const amount = receivableMatches.reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
          const receivedAmount = receivableMatches.filter((item) => item.status === 'received').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
          const hasReceived = receivableMatches.some((item) => item.status === 'received');
          const hasPending = receivableMatches.some((item) => item.status !== 'received');
          const hasOverdue = receivableMatches.some((item) => item.status === 'overdue' || (item.status !== 'received' && item.due_date && item.due_date.slice(0, 10) < todayKey));
          let status = 'futuro';
          if (hasReceived && !hasPending) status = 'recebido';
          else if (hasReceived && hasPending) status = 'parcial';
          else if (!amount) status = 'futuro';
          else if (hasOverdue) status = 'vencido';
          else status = 'a_receber';
          return { key: `${hospital.id}-${key}`, status, amount, partialAmount: receivedAmount };
        });

        return {
          hospitalId: hospital.id,
          hospitalName: hospital.sigla || hospital.name,
          cells,
          hasMovements: cells.some((cell) => cell.amount > 0),
        };
      })
      .sort((a, b) => Number(b.hasMovements) - Number(a.hasMovements) || a.hospitalName.localeCompare(b.hospitalName));

    const pipelineTotals = months.map((month) => {
      const key = format(month, 'yyyy-MM');
      const columnCells = pipelineRows.map((row) => row.cells.find((cell) => cell.key.endsWith(key))).filter(Boolean);
      return {
        key,
        amount: columnCells.reduce((sum, cell) => sum + Number(cell.amount || 0), 0),
        hasOverdue: columnCells.some((cell) => cell.status === 'vencido'),
      };
    });

    const totalWorked = filteredReceivables.reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
    const totalReceived = filteredReceivables.filter((item) => item.status === 'received').reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
    const overdueAmount = filteredReceivables.filter((item) => item.status !== 'received' && item.due_date && item.due_date.slice(0, 10) < todayKey).reduce((sum, item) => sum + Number(item.net_amount || item.amount || 0), 0);
    const missingAmount = totalWorked - totalReceived;

    const hospitalPerformance = pipelineRows.map((row) => {
      const produced = row.cells.reduce((sum, cell) => sum + Number(cell.amount || 0), 0);
      const received = row.cells.reduce((sum, cell) => sum + Number(cell.partialAmount || (cell.status === 'recebido' ? cell.amount : 0) || 0), 0);
      return { name: row.hospitalName, rate: produced ? received / produced : 0 };
    }).sort((a, b) => b.rate - a.rate);

    const pjGroups = incomeSources.map((source) => {
      const sourceReceivables = filteredReceivables.filter((item) => item.income_source_id === source.id);
      const rows = sourceReceivables.map((item) => {
        const gross = Number(item.amount || 0);
        const net = Number(item.net_amount || item.amount || 0);
        const tax = gross - net;
        const overdue = item.status !== 'received' && item.due_date && item.due_date.slice(0, 10) < todayKey;
        return {
          id: item.id,
          hospital: item.description?.split('—')[0]?.trim() || source.name,
          competencia: item.competencia || item.due_date,
          gross,
          tax,
          net,
          status: item.status === 'received' ? 'recebido' : overdue ? 'vencido' : 'a_receber',
        };
      }).sort((a, b) => String(b.competencia || '').localeCompare(String(a.competencia || '')));

      if (!rows.length) return null;

      return {
        id: source.id,
        name: source.name,
        rows,
        gross: rows.reduce((sum, row) => sum + row.gross, 0),
        tax: rows.reduce((sum, row) => sum + row.tax, 0),
        net: rows.reduce((sum, row) => sum + row.net, 0),
        taxRate: rows.reduce((sum, row) => sum + row.gross, 0) ? (rows.reduce((sum, row) => sum + row.tax, 0) / rows.reduce((sum, row) => sum + row.gross, 0)) * 100 : 0,
      };
    }).filter(Boolean);

    return {
      totalWorked,
      totalReceived,
      missingAmount,
      overdueAmount,
      bestPayer: hospitalPerformance[0],
      pipelineRows,
      pipelineTotals,
      pjGroups,
    };
  }, [receivables, hospitals, incomeSources, months, monthKeys, now]);

  const canGoNext = !isAfter(startOfMonth(addOneMonth(anchorMonth)), startOfMonth(now));

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <div className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <DashboardLogo className="h-5 w-5" />
          <div className="text-lg font-bold"><span className="text-foreground">Finanças</span><span className="text-primary">Zap</span></div>
          <span className="h-5 w-px bg-border" />
          <p className="text-sm text-muted-foreground">Recebimentos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative"><Bell className="h-4 w-4 text-muted-foreground" /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" /></div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-white">{getInitials(me?.full_name)}</div>
        </div>
      </div>

      <div className="space-y-3 p-4 md:p-4">
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recebimentos</h1>
            <p className="text-sm text-muted-foreground">Visão líquida por período e por PJ.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnchorMonth((current) => subMonths(current, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[110px] text-center text-sm font-semibold capitalize">{format(anchorMonth, 'MMMM yyyy', { locale: ptBR })}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => canGoNext && setAnchorMonth((current) => addOneMonth(current))} disabled={!canGoNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setRange(option)}
                  className={range === option ? 'rounded-md bg-[#0D3B66] px-3 py-1.5 text-xs font-bold text-white' : 'rounded-md border border-[#E8EDF2] bg-white px-3 py-1.5 text-xs font-bold text-[#7B92A8]'}
                >
                  {option}M
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Trabalhado" value={formatCurrency(data.totalWorked, 2)} sub="líquido no período" />
          <KpiCard label="Recebido" value={formatCurrency(data.totalReceived, 2)} sub={`${data.totalWorked ? ((data.totalReceived / data.totalWorked) * 100).toFixed(1) : '0.0'}% do trabalhado`} />
          <KpiCard label="Falta receber" value={formatCurrency(data.missingAmount, 2)} sub={data.overdueAmount > 0 ? `${formatCurrency(data.overdueAmount, 2)} vencidos` : 'Tudo dentro do prazo'} valueClassName={data.overdueAmount > 0 ? 'text-[#C0392B]' : 'text-primary'} />
          <KpiCard label="Melhor pagador" value={data.bestPayer?.name || '—'} sub={data.bestPayer?.rate === 1 ? 'Sempre em dia' : `${((data.bestPayer?.rate || 0) * 100).toFixed(1)}% recebido`} />
        </div>

        <ReceivablesPipelineCard
          months={months.map((month) => ({ key: format(month, 'yyyy-MM'), label: format(month, 'MMM/yy', { locale: ptBR }).toUpperCase() }))}
          rows={data.pipelineRows}
          totals={data.pipelineTotals}
          hasHospitals={hospitals.filter((hospital) => hospital.active !== false).length > 0}
        />

        <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Plantões por PJ</span>
            </div>
            <Button variant="outline" size="sm" className="gap-2 text-xs text-primary border-primary/30">
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {data.pjGroups.map((group) => (
              <div key={group.id} className="overflow-hidden rounded-xl border border-border">
                <div className="flex flex-col gap-2 border-l-[3px] border-l-primary bg-[#EEF5FB] px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-[#0D3B66]">{group.name}</p>
                      <p className="text-xs text-muted-foreground">Bruto: {formatCurrency(group.gross, 2)} · Imposto: {formatCurrency(group.tax, 2)} ({group.taxRate.toFixed(1)}%) · Líquido: {formatCurrency(group.net, 2)}</p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-[#F8FAFC]">
                      <tr className="text-[9px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                        <th className="px-4 py-3">Hospital</th>
                        <th className="px-4 py-3">Compet.</th>
                        <th className="px-4 py-3">Bruto</th>
                        <th className="px-4 py-3">Imposto</th>
                        <th className="px-4 py-3">Líquido</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr key={row.id} className={index % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}>
                          <td className="px-4 py-3 text-sm">{row.hospital}</td>
                          <td className="px-4 py-3 text-sm">{row.competencia ? format(new Date(`${row.competencia.slice(0, 10)}T12:00:00`), 'MMM/yy', { locale: ptBR }) : '—'}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatCurrency(row.gross, 2)}</td>
                          <td className="px-4 py-3 text-sm text-[#C0622A]">{formatCurrency(row.tax, 2)}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#0D3B66]">{formatCurrency(row.net, 2)}</td>
                          <td className="px-4 py-3"><StatusBadge status={row.status} amount={row.net} partialAmount={row.net} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-border bg-[#F0F4F8] px-4 py-2 text-[10px] font-bold uppercase text-foreground">
                  Total Bruto: {formatCurrency(group.gross, 2)} · Imposto: {formatCurrency(group.tax, 2)} · Líquido: {formatCurrency(group.net, 2)}
                </div>
              </div>
            ))}
            {data.pjGroups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum recebimento encontrado no período.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function addOneMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 12, 0, 0);
}

function KpiCard({ label, value, sub, valueClassName = 'text-foreground' }) {
  return (
    <div className="rounded-xl border border-[#E8EDF2] bg-white px-4 py-3">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${valueClassName}`}>{value}</div>
      <div className="mt-1 text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function StatusBadge(props) {
  const { status, amount, partialAmount } = props;
  const styles = {
    recebido: 'bg-[#E6F9F0] border-[#0A9E6A] text-[#0A6E50]',
    vencido: 'bg-[#FFECEC] border-[#E74C3C] text-[#C0392B]',
    parcial: 'bg-[#FFF8EC] border-[#F0C070] text-[#C0622A]',
    a_receber: 'bg-[#E0F5F5] border-[#0FA3A3] text-[#0A7070]',
  };
  const label = status === 'recebido'
    ? 'Recebido'
    : status === 'vencido'
      ? 'Vencido'
      : status === 'parcial'
        ? `${formatCurrency(partialAmount, 2)}/${formatCurrency(amount, 2)}`
        : 'Prazo';

  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${styles[status] || styles.a_receber}`}>{label}</span>;
}