import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, PieChart, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, getDaysLate, getLateLabel, normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

export default function AttentionCard({ data }) {
  const [openSections, setOpenSections] = useState({});
  const hasAlerts = data.overdueReceivables.length || data.urgentPayables.length || data.budgetOverruns.length;

  const toggle = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.05em] text-[#FF6B57]">
        <AlertTriangle className="h-4 w-4" />
        <span>Requer atenção</span>
      </div>

      {!hasAlerts ? (
        <div className="mt-4 rounded-[10px] border border-[#0A9E6A]/20 bg-[#E6F9F0] p-4 text-[#0A6E50]">
          <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Tudo em ordem hoje</div>
          <p className="mt-1 text-xs text-[#0A6E50]/80">Sem alertas críticos no momento.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!!data.overdueReceivables.length && (
            <AlertSection
              title={`${data.overdueReceivables.length} recebimentos vencidos — ${formatCurrency(data.overdueReceivablesTotal, 0)}`}
              icon={Clock3}
              tone="red"
              open={!!openSections.receivables}
              onToggle={() => toggle('receivables')}
            >
              {data.overdueReceivables.map((item) => {
                const days = getDaysLate(item.due_date);
                return (
                  <AlertRow
                    key={item.id}
                    title={item.hospital_name || item.description}
                    value={formatCurrency(item.amount, 0)}
                    subtitle={`${item.competencia_label} · ${getLateLabel(days)}`}
                    subtitleClass="text-[#C0392B] font-semibold"
                  />
                );
              })}
            </AlertSection>
          )}

          {!!data.urgentPayables.length && (
            <AlertSection
              title={`${data.urgentPayables.length} contas urgentes — ${formatCurrency(data.urgentPayablesTotal, 0)}`}
              icon={ReceiptText}
              tone="orange"
              open={!!openSections.payables}
              onToggle={() => toggle('payables')}
            >
              {data.urgentPayables.map((item) => {
                const days = getDaysLate(item.due_date);
                return (
                  <AlertRow
                    key={item.id}
                    title={item.description}
                    value={formatCurrency(item.amount, 0)}
                    subtitle={`${normalizeCategoryLabel(item.category_slug)} · ${days > 0 ? `Venceu há ${days}d` : 'Vence hoje'}`}
                  />
                );
              })}
            </AlertSection>
          )}

          {!!data.budgetOverruns.length && (
            <AlertSection
              title={`${data.budgetOverruns.length} categorias estouraram o orçamento`}
              icon={PieChart}
              tone="softred"
              open={!!openSections.budget}
              onToggle={() => toggle('budget')}
            >
              {data.budgetOverruns.map((item) => {
                const percent = item.budget > 0 ? Math.min((item.spent / item.budget) * 100, 100) : 100;
                return (
                  <div key={item.slug} className="rounded-[7px] bg-white/80 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#C0392B]">
                      <span>{item.name}</span>
                      <span>+{formatCurrency(item.overrun, 0)} acima</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#FFD8D2]">
                      <div className="h-2 rounded-full bg-[#E74C3C]" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-[#C0392B]">{formatCurrency(item.spent, 0)} gasto · limite {formatCurrency(item.budget, 0)}</p>
                  </div>
                );
              })}
            </AlertSection>
          )}
        </div>
      )}
    </section>
  );
}

function AlertSection({ title, icon: IconComponent, tone, open, onToggle, children }) {
  const styles = {
    red: 'border-[#FFCCC4] bg-[#FFF4F2] text-[#C0392B]',
    orange: 'border-[#F0C070] bg-[#FFF8EC] text-[#C0622A]',
    softred: 'border-[#FFBBB0] bg-[#FFECEC] text-[#C0392B]',
  };

  return (
    <div className={`rounded-[10px] border p-3 ${styles[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold">
          <IconComponent className="h-4 w-4" />
          <span>{title}</span>
        </div>
        <button type="button" onClick={onToggle} className="text-[10px] font-bold uppercase tracking-[0.05em] inline-flex items-center gap-1">
          {open ? 'Recolher' : 'Ver'}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function AlertRow({ title, value, subtitle, subtitleClass = '' }) {
  return (
    <div className="rounded-[7px] bg-white/80 p-3">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span>{title}</span>
        <span>{value}</span>
      </div>
      <p className={`mt-1 text-[11px] text-muted-foreground ${subtitleClass}`}>{subtitle}</p>
    </div>
  );
}