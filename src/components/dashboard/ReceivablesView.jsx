import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, isPast, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, AlertCircle, AlertTriangle, TrendingUp } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const DARF_LIMIT = 50000;

export default function ReceivablesView({ receivables, incomeSources, transactions = [] }) {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  // Recebido no mês: Transactions de receita PJ com date no mês corrente
  const receivedThisMonth = transactions.filter(
    t => t.type === 'income' && t.category === 'receita_pj' &&
    t.date >= monthStart && t.date <= monthEnd
  );

  // Atrasado: não pago e vencimento <= hoje
  const overdue = receivables.filter(
    r => r.status !== 'received' && r.due_date && r.due_date <= todayStr
  );

  const totalReceived = receivedThisMonth.reduce((t, tx) => t + (tx.net_amount || tx.amount || 0), 0);
  const totalOverdue = overdue.reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);

  // Tabela por PJ: recebido no mês (via Transactions) + projetado (Receivables pending)
  const pjSources = incomeSources.filter(s => s.type === 'pj');

  const pjTableData = pjSources.map(src => {
    const srcReceivables = receivables.filter(r => r.income_source_id === src.id);
    const receivedMonth = transactions
      .filter(t => t.type === 'income' && t.income_source_id === src.id && t.date >= monthStart && t.date <= monthEnd)
      .reduce((s, t) => s + (t.net_amount || t.amount || 0), 0);
    const projected = srcReceivables
      .filter(r => r.status !== 'received')
      .reduce((s, r) => s + (r.net_amount || r.amount || 0), 0);
    const darf = receivedMonth * 0.10;
    return { src, receivedMonth, projected, darf };
  }).filter(row => row.receivedMonth > 0 || row.projected > 0);

  // Card PF: salário + bolsa recebidos no mês (via Transactions)
  const pfTransactions = transactions.filter(
    t => t.type === 'income' &&
    t.date >= monthStart && t.date <= monthEnd &&
    (t.category === 'salario_clt' || t.description?.toLowerCase().includes('bolsa internato') || t.description?.toLowerCase().includes('bolsa'))
  );
  const pfTotal = pfTransactions.reduce((s, t) => s + (t.net_amount || t.amount || 0), 0);

  // Lista atrasados ordenada
  const overdueList = [...overdue].sort((a, b) => {
    const siglaA = (a.description.split('—')[0] || '').trim().toLowerCase();
    const siglaB = (b.description.split('—')[0] || '').trim().toLowerCase();
    if (siglaA !== siglaB) return siglaA.localeCompare(siglaB, 'pt-BR');
    return (a.due_date || '').localeCompare(b.due_date || '');
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Totalizadores: 2 cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-2.5 md:p-4">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-[10px] md:text-xs font-medium text-emerald-700 leading-tight">Plantões recebidos no mês</span>
            </div>
            <p className="text-sm md:text-xl font-bold text-emerald-700">{fmt(totalReceived)}</p>
            <p className="text-[10px] md:text-xs text-emerald-600 mt-0.5">{receivedThisMonth.length} item(s)</p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${overdue.length > 0 ? 'bg-red-50' : 'bg-muted/30'}`}>
          <CardContent className="p-2.5 md:p-4">
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 ${overdue.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] md:text-xs font-medium leading-tight ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                Atrasado
              </span>
            </div>
            <p className={`text-sm md:text-xl font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
              {fmt(totalOverdue)}
            </p>
            <p className={`text-[10px] md:text-xs mt-0.5 ${overdue.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {overdue.length} item(s)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Tabela por PJ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Receitas por PJ no Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pjTableData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 px-4">Nenhuma receita PJ no mês</p>
            ) : (
              <div className="divide-y divide-border">
                {pjTableData.map(({ src, receivedMonth, projected, darf }) => {
                  const receivedAlert = receivedMonth >= DARF_LIMIT;
                  const projectedAlert = projected >= DARF_LIMIT;
                  return (
                    <div key={src.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{src.name}</span>
                        {src.bank && <span className="text-xs text-muted-foreground">{src.bank}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Recebido */}
                        <div className={`rounded-lg p-2 ${receivedAlert ? 'bg-red-50 border border-red-200' : 'bg-emerald-50'}`}>
                          <p className={`font-medium mb-0.5 ${receivedAlert ? 'text-red-700' : 'text-emerald-700'}`}>Recebido</p>
                          <p className={`font-bold text-sm ${receivedAlert ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(receivedMonth)}</p>
                          {receivedAlert && (
                            <p className="text-red-600 flex items-center gap-1 mt-1">
                              <AlertTriangle className="w-3 h-3" /> Acima de R$50k
                            </p>
                          )}
                        </div>
                        {/* Projetado */}
                        <div className={`rounded-lg p-2 ${projectedAlert ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50'}`}>
                          <p className={`font-medium mb-0.5 ${projectedAlert ? 'text-amber-700' : 'text-blue-700'}`}>Projetado</p>
                          <p className={`font-bold text-sm ${projectedAlert ? 'text-amber-700' : 'text-blue-700'}`}>{fmt(projected)}</p>
                          {projectedAlert && (
                            <p className="text-amber-600 flex items-center gap-1 mt-1">
                              <AlertTriangle className="w-3 h-3" /> Acima de R$50k
                            </p>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
                {/* Card PF */}
                {pfTotal > 0 && (
                  <div className="px-4 py-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">PF (Salário + Bolsa)</span>
                      <span className="text-xs text-muted-foreground">Santander</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg p-2 bg-emerald-50">
                        <p className="font-medium mb-0.5 text-emerald-700">Recebido</p>
                        <p className="font-bold text-sm text-emerald-700">{fmt(pfTotal)}</p>
                      </div>
                      <div className="rounded-lg p-2 bg-slate-100">
                        <p className="font-medium mb-0.5 text-slate-500">Projetado</p>
                        <p className="font-bold text-sm text-slate-400">—</p>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground pl-0.5">
                      {pfTransactions.map(t => (
                        <span key={t.id} className="mr-3">{t.description}: {fmt(t.net_amount || t.amount)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contas a Receber — Atrasadas */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Atrasados — A Receber</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
              {overdueList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta atrasada 🎉</p>
              ) : (
                overdueList.map(r => {
                  const isExactlyToday = r.due_date === todayStr;
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isExactlyToday ? 'bg-amber-400' : 'bg-red-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{r.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.due_date ? format(new Date(r.due_date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                          {isExactlyToday
                            ? <span className="text-amber-600 ml-1">· Hoje</span>
                            : <span className="text-red-500 ml-1">· Vencido</span>
                          }
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-600">{fmt(r.net_amount || r.amount)}</span>
                        {r.net_amount > 0 && r.amount > 0 && r.net_amount < r.amount && (
                          <p className="text-[10px] text-muted-foreground/60">{fmt(r.amount)} bruto</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}