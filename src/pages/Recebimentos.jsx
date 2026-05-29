import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, ChevronLeft, ChevronRight, Download, Landmark, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import DashboardLogo from '@/components/dashboard/DashboardLogo';
import { getInitials, formatCurrency } from '@/components/dashboard/financaszapTheme';
import { Button } from '@/components/ui/button';
import ReceivableFormModal from '@/components/receivables/ReceivableFormModal';

function getStoredMonth() {
  const value = localStorage.getItem('receb_mes');
  return value ? new Date(`${value}-01T12:00:00`) : new Date();
}

export default function Recebimentos() {
  const [anchorMonth, setAnchorMonth] = useState(getStoredMonth);
  const [showReceivableForm, setShowReceivableForm] = useState(false);
  const now = new Date();
  const range = 1;

  useEffect(() => {
    localStorage.setItem('receb_mes', format(anchorMonth, 'yyyy-MM'));
  }, [anchorMonth]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: receivables = [] } = useQuery({ queryKey: ['recebimentos-receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 1000) });
  const { data: transactions = [] } = useQuery({ queryKey: ['recebimentos-transactions'], queryFn: () => base44.entities.Transaction.list('-date', 2000) });
  const { data: hospitals = [] } = useQuery({ queryKey: ['recebimentos-hospitals'], queryFn: () => base44.entities.Hospital.list('name', 500) });
  const { data: incomeSources = [] } = useQuery({ queryKey: ['recebimentos-income-sources'], queryFn: () => base44.entities.IncomeSource.list('name', 500) });
  const { data: categories = [] } = useQuery({ queryKey: ['recebimentos-categories'], queryFn: () => base44.entities.Category.list('name', 500) });

  const data = useMemo(() => {
    const currentMonthKey = format(anchorMonth, 'yyyy-MM');
    const hoje = format(now, 'yyyy-MM-dd');

    const enrichedReceivables = receivables.map(r => {
      const hosp = hospitals.find(h => h.id === r.hospital_id);
      const src = incomeSources.find(s => s.id === r.income_source_id);
      const net = Number(r.net_amount || r.amount || 0);
      const gross = Number(r.amount || 0);
      return {
        ...r,
        hospital: r.description?.split('—')[0]?.trim() || hosp?.sigla || hosp?.name || src?.name || 'Outras',
        pjName: src?.name || 'Outras',
        net_amount: net,
        gross_amount: gross,
        tax_amount: gross - net,
      };
    });

    const expectedReceivables = enrichedReceivables.filter(item => {
      const due = (item.due_date || '').slice(0, 7);
      return due === currentMonthKey;
    });

    const totalEsperado = expectedReceivables.reduce((sum, item) => sum + item.net_amount, 0);

    const totalRecebido = enrichedReceivables.filter(item => {
      if (!item.transaction_id) return false;
      const tx = transactions.find(t => t.id === item.transaction_id);
      return tx && (tx.date || '').slice(0, 7) === currentMonthKey;
    }).reduce((sum, item) => sum + item.net_amount, 0);

    const pctRecebido = totalEsperado > 0 ? ((totalRecebido / totalEsperado) * 100).toFixed(1) : '0.0';

    const pendentes = expectedReceivables.filter(item => item.status !== 'received');
    const totalPendente = pendentes.reduce((sum, item) => sum + item.net_amount, 0);
    const overdueAmount = pendentes.filter(item => (item.due_date || '') < hoje).reduce((sum, item) => sum + item.net_amount, 0);

    const hospitalStats = {};
    expectedReceivables.forEach(r => {
      const hName = r.hospital;
      if (!hospitalStats[hName]) hospitalStats[hName] = { produced: 0, received: 0 };
      hospitalStats[hName].produced += r.net_amount;
      if (r.status === 'received') {
        hospitalStats[hName].received += r.net_amount;
      }
    });
    
    const hospitalPerformance = Object.entries(hospitalStats).map(([name, stats]) => ({
      name,
      rate: stats.produced ? stats.received / stats.produced : 0
    })).sort((a, b) => b.rate - a.rate);

    // Receivables cujo pagamento (Transaction.date) caiu no mês selecionado
    const recebidosNoMes = enrichedReceivables.filter(item => {
      if (!item.transaction_id) return false;
      const tx = transactions.find(t => t.id === item.transaction_id);
      return tx && (tx.date || '').slice(0, 7) === currentMonthKey;
    });

    // Agrupar por PJ (income_source_id ou pjName)
    const pjMap = {};
    recebidosNoMes.forEach(item => {
      const pjKey = item.income_source_id || item.pjName || 'Outros';
      if (!pjMap[pjKey]) {
        pjMap[pjKey] = { id: pjKey, name: item.pjName || pjKey, gross: 0, tax: 0, net: 0, taxRate: 0, rows: [] };
      }
      pjMap[pjKey].gross += Number(item.gross_amount || item.amount || 0);
      pjMap[pjKey].tax   += Number(item.tax_amount || 0);
      pjMap[pjKey].net   += Number(item.net_amount || item.amount || 0);
      pjMap[pjKey].rows.push({
        id: item.id,
        hospital: item.hospital,
        competencia: item.competencia || item.due_date,
        due_date: item.due_date || item.competencia,
        gross: Number(item.gross_amount || item.amount || 0),
        tax: Number(item.tax_amount || 0),
        net: Number(item.net_amount || item.amount || 0),
        status: 'recebido'
      });
    });

    Object.values(pjMap).forEach(pj => {
      pj.taxRate = pj.gross > 0 ? (pj.tax / pj.gross) * 100 : 0;
    });

    const pjGroups = Object.values(pjMap).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );

    return {
      currentMonthKey,
      enrichedReceivables,
      totalEsperado,
      totalRecebido,
      pctRecebido,
      totalPendente,
      overdueAmount,
      bestPayer: hospitalPerformance[0],
      pjGroups,
    };
  }, [receivables, transactions, hospitals, incomeSources, anchorMonth, now]);

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
            <p className="text-sm text-muted-foreground">Visão de caixa por período e por PJ.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowReceivableForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo recebível
            </Button>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnchorMonth((current) => subMonths(current, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[110px] text-center text-sm font-semibold capitalize">{format(anchorMonth, 'MMMM yyyy', { locale: ptBR })}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => canGoNext && setAnchorMonth((current) => addOneMonth(current))} disabled={!canGoNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total esperado" value={formatCurrency(data.totalEsperado, 2)} sub={`a vencer em ${format(anchorMonth, 'MMM', { locale: ptBR })}`} />
          <KpiCard label="Recebido" value={formatCurrency(data.totalRecebido, 2)} sub={`pago em ${format(anchorMonth, 'MMM', { locale: ptBR })} · ${data.pctRecebido}%`} />
          <KpiCard label="Pendente" value={formatCurrency(data.totalPendente, 2)} sub={data.overdueAmount > 0 ? `${formatCurrency(data.overdueAmount, 2)} vencidos` : 'Tudo dentro do prazo'} valueClassName={data.overdueAmount > 0 ? 'text-[#C0392B]' : 'text-primary'} />
          <KpiCard label="Melhor pagador" value={data.bestPayer?.name || '—'} sub={data.bestPayer?.rate === 1 ? 'Sempre em dia' : `${((data.bestPayer?.rate || 0) * 100).toFixed(1)}% recebido`} />
        </div>

        <ReceivimentosPorStatus 
          receivables={data.enrichedReceivables} 
          transactions={transactions} 
          currentMonthKey={data.currentMonthKey} 
          mesLabel={format(anchorMonth, 'MMMM', { locale: ptBR })}
        />

        <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Recebido por PJ em {format(anchorMonth, 'MMM', { locale: ptBR })}</span>
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
                          <td className="px-4 py-3 text-sm">{row.competencia ? format(new Date(`${row.competencia.slice(0, 10)}T12:00:00`), 'MMM/yy', { locale: ptBR }).toUpperCase() : '—'}</td>
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
        {showReceivableForm && (
          <ReceivableFormModal
            incomeSources={incomeSources}
            categories={categories}
            onClose={() => setShowReceivableForm(false)}
            onSaved={async () => {
              setShowReceivableForm(false);
              await base44.entities.Receivable.list('-due_date', 1);
              window.location.reload();
            }}
          />
        )}
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

function ReceivimentosPorStatus({ receivables, transactions, currentMonthKey, mesLabel }) {
  const hoje = new Date().toISOString().slice(0, 10);
  
  const vencidos = receivables.filter(item => {
    const due = (item.due_date || '').slice(0, 7);
    return due === currentMonthKey
      && item.status !== 'received'
      && (item.due_date || '') < hoje;
  });

  const aReceber = receivables.filter(item => {
    const due = (item.due_date || '').slice(0, 7);
    return due === currentMonthKey
      && item.status !== 'received'
      && (item.due_date || '') >= hoje;
  });

  const recebidos = receivables.filter(item => {
    if (!item.transaction_id) return false;
    const tx = transactions.find(t => t.id === item.transaction_id);
    return tx && (tx.date || '').slice(0, 7) === currentMonthKey;
  });

  const somaVencidos  = vencidos.reduce((s, r) => s + Number(r.net_amount || r.amount || 0), 0);
  const somaAReceber  = aReceber.reduce((s, r) => s + Number(r.net_amount || r.amount || 0), 0);
  const somaRecebidos = recebidos.reduce((s, r) => s + Number(r.net_amount || r.amount || 0), 0);
  const totalReal     = somaVencidos + somaAReceber + somaRecebidos;

  if (vencidos.length === 0 && aReceber.length === 0 && recebidos.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">Nenhum recebimento encontrado no período.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {vencidos.length > 0 && (
        <StatusCard
          title="Vencido" icon="⚠"
          rows={vencidos}
          transactions={transactions}
          variant="vencido"
        />
      )}
      {recebidos.length > 0 && (
        <StatusCard
          title="Recebido" icon="✓"
          rows={recebidos}
          transactions={transactions}
          variant="recebido"
        />
      )}
      {aReceber.length > 0 && (
        <StatusCard
          title="A receber" icon="📅"
          rows={aReceber}
          transactions={transactions}
          variant="a_receber"
        />
      )}

      {/* Linha + Total esperado */}
      <div className="border-t-2 border-border pt-3 flex justify-end items-baseline gap-1 pr-5">
        <span className="text-sm font-semibold text-foreground">TOTAL =</span>
        <span className="text-base font-semibold text-[#0D3B66]">{formatCurrency(totalReal, 2)}</span>
      </div>
    </div>
  );
}

function StatusCard({ title, icon, rows, transactions, variant }) {
  const headerColor = {
    vencido:   'text-[#C0392B]',
    recebido:  'text-[#0A6E50]',
    a_receber: 'text-[#0A7070]',
  };
  const badgeCls = {
    vencido:   'bg-[#FFD4D4] text-[#C0392B]',
    recebido:  'bg-[#CCF3E3] text-[#0A6E50]',
    a_receber: 'bg-[#B8E8E8] text-[#0A7070]',
  };
  const total = rows.reduce((s, r) => s + Number(r.net_amount || r.amount || 0), 0);

  // Ordenar alfabeticamente por sigla do hospital
  const sortedRows = [...rows].sort((a, b) =>
    (a.hospital || '').localeCompare(b.hospital || '', 'pt-BR')
  );

  const bgHeader = {
    vencido:   'bg-[#FFF5F5]',
    recebido:  'bg-[#F0FBF7]',
    a_receber: 'bg-[#F0FAFA]',
  };

  return (
    <div className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
      <div className={`flex items-center justify-between px-5 py-3 border-b border-border ${bgHeader[variant]}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold uppercase tracking-[0.06em] ${headerColor[variant]}`}>
            {icon} {title}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badgeCls[variant]}`}>
            {rows.length}
          </span>
        </div>
        <span className="text-sm font-bold text-[#0D3B66]">{formatCurrency(total, 2)}</span>
      </div>
      <div className="divide-y divide-[#F0F4F8]">
        {sortedRows.map(row => (
          <StatusRow key={row.id} row={row} transactions={transactions} variant={variant} />
        ))}
      </div>
    </div>
  );
}

function StatusRow({ row, transactions, variant }) {
  const valueColor = {
    vencido:   'text-[#C0392B]',
    recebido:  'text-[#0A6E50]',
    a_receber: 'text-[#0A7070]',
  };

  const tx = row.transaction_id
    ? transactions.find(t => t.id === row.transaction_id)
    : null;

  // Linha 1: competência em MMM/yy
  const competenciaLabel = row.competencia
    ? format(new Date(`${row.competencia.slice(0, 10)}T12:00:00`), "MMM/yy", { locale: ptBR }).toUpperCase()
    : null;

  // Linha 2: vencimento em MMM/yy
  const vencLabel = row.due_date
    ? format(new Date(`${row.due_date.slice(0, 10)}T12:00:00`), "MMM/yy", { locale: ptBR }).toUpperCase()
    : null;

  // Linha 2: pagamento em dd/MMM
  const pagtoLabel = tx?.date
    ? format(new Date(`${tx.date.slice(0, 10)}T12:00:00`), "dd/MMM", { locale: ptBR }).toUpperCase()
    : null;

  const titulo = [row.hospital, competenciaLabel].filter(Boolean).join(' - ');

  const subtitulo = [
    vencLabel  ? `Venc: ${vencLabel}`   : null,
    pagtoLabel ? `Pagto: ${pagtoLabel}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-[#F8FAFC] transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-[#0D3B66] truncate">{titulo}</span>
        {subtitulo && (
          <span className="text-xs text-[#4A6278]">{subtitulo}</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 ml-4 flex-shrink-0">
        <span className={`text-sm font-bold ${valueColor[variant]}`}>
          {formatCurrency(Number(row.net_amount || row.amount || 0), 2)}
        </span>
        {Number(row.tax_amount || 0) > 0 && (
          <span className="text-[9px] text-[#7B92A8]">
            bruto {formatCurrency(Number(row.gross_amount || row.amount || 0), 2)}
          </span>
        )}
      </div>
    </div>
  );
}