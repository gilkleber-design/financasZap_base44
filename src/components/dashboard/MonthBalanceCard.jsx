import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { formatCurrency } from '@/components/dashboard/financaszapTheme';

export default function MonthBalanceCard({ data }) {
  const positive = data.balance >= 0;
  const deltaPositive = data.variation >= 0;

  return (
    <section className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
        <Wallet className="h-4 w-4 text-primary" />
        <span>Saldo do mês</span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold text-foreground md:text-[28px]">{formatCurrency(data.balance, 0)}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Receitas recebidas − despesas pagas</p>
        </div>

        <div className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-bold ${deltaPositive ? 'border-emerald-600/20 bg-[#E6F9F0] text-[#0A6E50]' : 'border-[#E74C3C]/20 bg-[#FFECEC] text-[#C0392B]'}`}>
          {deltaPositive ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
          {`${deltaPositive ? '+' : ''}${data.variation.toFixed(0)}% vs ${data.previousMonthLabel}`}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Entrou" value={data.receivedIncome} valueClass="text-[#0A6E50]" />
        <Stat label="Saiu" value={data.paidExpense} valueClass="text-[#FF6B57]" />
        <Stat label="A receber" value={data.toReceive} valueClass="text-primary" />
      </div>

      {!data.hasActivity && (
        <p className="mt-4 rounded-[10px] bg-secondary px-3 py-2 text-xs text-muted-foreground">Nenhuma movimentação registrada este mês.</p>
      )}
    </section>
  );
}

function Stat({ label, value, valueClass }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueClass}`}>{formatCurrency(value, 0)}</p>
    </div>
  );
}