import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const STATUS_PILL = {
  paid: 'bg-[#E6F9F0] border-[#0A9E6A] text-[#0A6E50]',
  overdue: 'bg-[#FFECEC] border-[#E74C3C] text-[#C0392B]',
  pending: 'bg-[#E0F5F5] border-[#0FA3A3] text-[#0A7070]',
  auto: 'bg-[#F0F4F8] border-[#C8D6E0] text-[#7B92A8]',
};

export default function PayablesOverview({
  monthLabel,
  kpis,
  sections,
  paidOpen,
  onTogglePaid,
  onOpenNew,
  onOpenManageRecurring,
  onOpenPay,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">Compromissos organizados por urgência.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold capitalize">{monthLabel}</span>
          <Button variant="outline" onClick={onOpenManageRecurring}>Fixas</Button>
          <Button onClick={onOpenNew}>Nova despesa</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Previsto" value={formatCurrency(kpis.expected, 2)} sub="este mês" />
        <KpiCard label="Pago" value={formatCurrency(kpis.paid, 2)} sub={`${kpis.expected ? ((kpis.paid / kpis.expected) * 100).toFixed(1) : '0.0'}% do mês`} />
        <KpiCard label="Em aberto" value={formatCurrency(kpis.open, 2)} sub="a pagar" />
        <KpiCard label="Vencido" value={formatCurrency(kpis.overdue, 2)} sub={kpis.overdue > 0 ? 'ação urgente' : 'sem atrasos'} valueClassName={kpis.overdue > 0 ? 'text-[#C0392B]' : 'text-[#0A6E50]'} />
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <button
            type="button"
            onClick={section.collapsible ? onTogglePaid : undefined}
            className={`flex w-full items-center gap-2 border-b border-border pb-1 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground ${section.key === 'overdue' ? 'section-vencidas' : ''}`}
          >
            <section.icon className="h-4 w-4" />
            <span>{section.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${section.key === 'overdue' ? 'bg-[#FFECEC] text-[#C0392B]' : 'bg-[#E8EDF2] text-[#7B92A8]'}`}>{section.items.length}</span>
            {section.collapsible && <span className="ml-auto text-xs">{paidOpen ? '−' : '+'}</span>}
          </button>

          {(!section.collapsible || paidOpen) && (
            <div className="space-y-2">
              {section.items.map((item) => (
                <Card key={item.id} className={`border-[#E8EDF2] ${item.style === 'overdue' ? 'border-l-[3px] border-l-[#C0392B]' : item.style === 'urgent' ? 'border-l-[3px] border-l-[#F0A030]' : ''} ${item.autoDebit ? 'opacity-65 hover:opacity-100' : ''}`}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#EEF5FB] text-[#0D3B66]">
                      <section.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold text-[#0D3B66]">{item.description}</p>
                        {item.installmentLabel && <span className="rounded border border-[#C8D6E0] bg-[#F0F4F8] px-1.5 py-0.5 text-[9px] font-bold text-[#7B92A8]">{item.installmentLabel}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{normalizeCategoryLabel(item.category)}</span>
                        <span>·</span>
                        <span>Venc. {item.dueDateLabel}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${STATUS_PILL[item.pill] || STATUS_PILL.pending}`}>{item.pillLabel}</span>
                      </div>
                    </div>
                    <div className={`text-right text-sm font-bold ${item.style === 'overdue' ? 'text-[#C0392B]' : 'text-[#0D3B66]'}`}>{formatCurrency(item.amount, 2)}</div>
                    {item.canPay && <Button size="sm" onClick={() => onOpenPay(item.original)}>Pagar</Button>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
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

export const PAYABLE_SECTION_ICONS = {
  overdue: AlertTriangle,
  soon: Clock3,
  week: CalendarClock,
  month: CalendarClock,
  auto: CreditCard,
  paid: CheckCircle2,
};