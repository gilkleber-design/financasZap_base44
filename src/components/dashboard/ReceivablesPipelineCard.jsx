import { Building2, CalendarClock, CheckCircle2, CircleAlert, Clock3, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/components/dashboard/financaszapTheme';
import { Button } from '@/components/ui/button';

const STATUS_STYLES = {
  recebido: 'bg-[#E6F9F0] border-[#0A9E6A] text-[#0A9E6A]',
  vencido: 'bg-[#FFECEC] border-[#E74C3C] text-[#C0392B]',
  parcial: 'bg-[#FFF8EC] border-[#F0C070] text-[#C0622A]',
  a_receber: 'bg-[#E8F4FF] border-[#1E5BA8] text-[#1E5BA8]',
  futuro: 'bg-[#F0F4F8] border-[#C8D6E0] text-[#7B92A8]',
};

const STATUS_ICONS = {
  recebido: CheckCircle2,
  vencido: CircleAlert,
  parcial: Clock3,
  a_receber: CalendarClock,
  futuro: Landmark,
};

export default function ReceivablesPipelineCard({ months, rows, totals, hasHospitals }) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span>Pipeline de recebimentos</span>
        <span className="normal-case tracking-normal text-xs font-medium text-muted-foreground">por hospital</span>
      </div>

      {!hasHospitals ? (
        <div className="mt-4 rounded-[10px] border border-[#C8D6E0] bg-secondary p-5 text-center">
          <Building2 className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">Cadastre seus hospitais para ver o pipeline</p>
          <Button asChild className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/hospitais">Cadastrar hospital</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                <th className="py-3 pr-4 font-bold">Hospital</th>
                {months.map((month) => (
                  <th key={month.key} className="py-3 pr-4 font-bold min-w-[130px]">
                    <div>{month.label}</div>
                    <div className="normal-case tracking-normal font-medium">trabalhado</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.hospitalId} className="border-b border-border/60 last:border-b-0">
                  <td className="py-3 pr-4 text-sm font-semibold text-foreground">{row.hospitalName}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.key} className="py-3 pr-4">
                      <StatusPill status={cell.status} amount={cell.amount} partialAmount={cell.partialAmount} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-sm font-bold text-foreground">
                <td className="pt-3 pr-4">Total</td>
                {totals.map((total) => (
                  <td key={total.key} className="pt-3 pr-4 text-foreground">
                    {formatCurrency(total.amount, 2)} {total.hasOverdue ? '⚠' : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>

          <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-medium text-muted-foreground">
            <LegendItem color="bg-[#0A9E6A]" label="Recebido" />
            <LegendItem color="bg-[#C0392B]" label="Vencido" />
            <LegendItem color="bg-[#F0C070]" label="Parcial" />
            <LegendItem color="bg-[#1E5BA8]" label="A receber" />
            <LegendItem color="bg-[#7B92A8]" label="Futuro" />
          </div>
        </div>
      )}
    </section>
  );
}

function StatusPill({ status, amount, partialAmount }) {
  const label = status === 'vencido'
    ? formatCurrency(amount, 2)
    : status === 'parcial'
      ? `${formatCurrency(partialAmount, 2)}/${formatCurrency(amount, 2)}`
      : status === 'recebido'
        ? formatCurrency(amount, 2)
        : status === 'futuro'
          ? formatCurrency(amount, 2)
          : formatCurrency(amount, 2);

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap ${STATUS_STYLES[status] || STATUS_STYLES.futuro}`}>
      {label}
    </span>
  );
}

function LegendItem({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}