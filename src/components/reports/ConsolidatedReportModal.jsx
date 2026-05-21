import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, FileText, CheckCircle2, TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ConsolidatedReportModal({ open, onOpenChange, currentMonth }) {
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [isGeneratingLLM, setIsGeneratingLLM] = useState(false);

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions_all'],
    queryFn: () => base44.entities.Transaction.list('-date', 5000),
  });

  const { data: payables = [], isLoading: loadingPay } = useQuery({
    queryKey: ['payables_all'],
    queryFn: () => base44.entities.Payable.list('-due_date', 5000),
  });

  const { data: receivables = [], isLoading: loadingRec } = useQuery({
    queryKey: ['receivables_all'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 5000),
  });

  const loading = loadingTx || loadingPay || loadingRec;

  useEffect(() => {
    if (!open) {
      setExecutiveSummary('');
    }
  }, [open, currentMonth]);

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
           <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  // --- 1. Receitas ---
  const monthReceivables = receivables.filter(r => (r.competencia || r.due_date) >= monthStart && (r.competencia || r.due_date) <= monthEnd);
  const monthIncomes = transactions.filter(t => t.type === 'income' && t.date >= monthStart && t.date <= monthEnd && t.status !== 'ignored');
  
  const totalReceitasPrevistas = monthReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);
  const totalReceitasRecebidas = monthIncomes.reduce((acc, t) => acc + (t.amount || 0), 0);
  const openReceivables = monthReceivables.filter(r => r.status !== 'received');
  const totalReceitasAberto = openReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);

  // --- 2. Despesas ---
  const monthPayables = payables.filter(p => (p.competencia || p.due_date) >= monthStart && (p.competencia || p.due_date) <= monthEnd);
  const monthExpenses = transactions.filter(t => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd && t.status !== 'ignored');

  const totalDespesasPrevistas = monthPayables.reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalDespesasPagas = monthExpenses.reduce((acc, t) => acc + (t.amount || 0), 0);
  const openPayables = monthPayables.filter(p => p.status !== 'paid');
  const totalDespesasAberto = openPayables.reduce((acc, p) => acc + (p.amount || 0), 0);

  // --- 3. Resultado realizado ---
  const resultadoRealizado = totalReceitasRecebidas - totalDespesasPagas;

  // --- 4. Resultado projetado ---
  const resultadoProjetado = totalReceitasPrevistas - totalDespesasPrevistas;

  // --- 5. Saldo final ---
  const allIncomesTotal = transactions.filter(t => t.type === 'income' && t.status !== 'ignored').reduce((acc, t) => acc + (t.amount || 0), 0);
  const allExpensesTotal = transactions.filter(t => t.type === 'expense' && t.status !== 'ignored').reduce((acc, t) => acc + (t.amount || 0), 0);
  const saldoAtualReal = allIncomesTotal - allExpensesTotal;

  const incomesBeforeMonth = transactions.filter(t => t.type === 'income' && t.date < monthStart && t.status !== 'ignored').reduce((acc, t) => acc + (t.amount || 0), 0);
  const expensesBeforeMonth = transactions.filter(t => t.type === 'expense' && t.date < monthStart && t.status !== 'ignored').reduce((acc, t) => acc + (t.amount || 0), 0);
  const saldoInicial = incomesBeforeMonth - expensesBeforeMonth;

  const saldoFinalProjetado = saldoAtualReal + totalReceitasAberto - totalDespesasAberto;

  const generateLLMSummary = async () => {
    setIsGeneratingLLM(true);
    try {
      const prompt = `
      Você é um consultor financeiro. Gere um resumo executivo simples e direto do seguinte cenário mensal (${format(currentMonth, 'MMMM yyyy', { locale: ptBR })}):
      - Total já recebido: R$ ${totalReceitasRecebidas.toFixed(2)}
      - Falta receber: R$ ${totalReceitasAberto.toFixed(2)}
      - Total já gasto/pago: R$ ${totalDespesasPagas.toFixed(2)}
      - Falta pagar: R$ ${totalDespesasAberto.toFixed(2)}
      - Saldo Atual Real da conta: R$ ${saldoAtualReal.toFixed(2)}
      - Resultado do Mês (receitas - despesas realizadas): R$ ${resultadoRealizado.toFixed(2)}
      - Projeção do Resultado do Mês (todas as receitas previstas - todas despesas previstas): R$ ${resultadoProjetado.toFixed(2)}
      - Saldo Final Projetado do Mês (considerando tudo que ainda falta receber e pagar): R$ ${saldoFinalProjetado.toFixed(2)}
      
      Explique em linguagem muito simples para o usuário:
      - quanto já entrou
      - quanto ainda falta receber
      - quanto já saiu
      - quanto ainda falta pagar
      - se o mês tende a fechar positivo ou negativo
      - quais são os maiores impactos e como está a saúde financeira baseando-se nestes totais.
      Seja conciso, use parágrafos curtos, encorajador e direto ao ponto. Não use formatação muito complexa (bold é ok).
      `;

      const response = await base44.integrations.Core.InvokeLLM({ prompt });
      setExecutiveSummary(response);
    } catch (e) {
      console.error(e);
      setExecutiveSummary('Erro ao gerar resumo executivo.');
    } finally {
      setIsGeneratingLLM(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 shrink-0 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Relatório Consolidado - {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8 pb-8">
            
            {/* 1. Receitas */}
            <section>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-600"><TrendingUp className="w-5 h-5"/> 1. Receitas do Mês</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-sm text-emerald-600 font-medium">Previstas no mês</p>
                  <p className="text-2xl font-bold text-emerald-700">{fmt(totalReceitasPrevistas)}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-sm text-emerald-600 font-medium">Já Recebidas</p>
                  <p className="text-2xl font-bold text-emerald-700">{fmt(totalReceitasRecebidas)}</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-600 font-medium">Em Aberto</p>
                  <p className="text-2xl font-bold text-amber-700">{fmt(totalReceitasAberto)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {/* Receitas em Aberto */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-amber-50/50 px-4 py-2 font-medium text-sm text-amber-700 flex justify-between">
                    <span>A Receber ({openReceivables.length})</span>
                    <span>{fmt(totalReceitasAberto)}</span>
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {openReceivables.length > 0 ? openReceivables.map(r => (
                      <div key={r.id} className="p-3 text-sm flex justify-between items-center hover:bg-slate-50/50">
                        <span className="truncate pr-2">{r.description}</span>
                        <div className="flex gap-4 items-center shrink-0">
                          <span className="text-slate-500 text-xs">{format(new Date(r.due_date), 'dd/MM/yyyy')}</span>
                          <span className="font-medium text-amber-600 w-20 text-right">{fmt(r.amount)}</span>
                        </div>
                      </div>
                    )) : <div className="p-4 text-center text-sm text-slate-500">Nenhuma receita pendente</div>}
                  </div>
                </div>

                {/* Receitas Realizadas */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-emerald-50/50 px-4 py-2 font-medium text-sm text-emerald-700 flex justify-between">
                    <span>Recebidas ({monthIncomes.length})</span>
                    <span>{fmt(totalReceitasRecebidas)}</span>
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {monthIncomes.length > 0 ? monthIncomes.map(t => (
                      <div key={t.id} className="p-3 text-sm flex justify-between items-center hover:bg-slate-50/50">
                        <span className="truncate pr-2">{t.description}</span>
                        <div className="flex gap-4 items-center shrink-0">
                          <span className="text-slate-500 text-xs">{format(new Date(t.date), 'dd/MM/yyyy')}</span>
                          <span className="font-medium text-emerald-600 w-20 text-right">{fmt(t.amount)}</span>
                        </div>
                      </div>
                    )) : <div className="p-4 text-center text-sm text-slate-500">Nenhuma receita registrada</div>}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Despesas */}
            <section>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-rose-600"><TrendingDown className="w-5 h-5"/> 2. Despesas do Mês</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-rose-50 rounded-lg border border-rose-100">
                  <p className="text-sm text-rose-600 font-medium">Previstas no mês</p>
                  <p className="text-2xl font-bold text-rose-700">{fmt(totalDespesasPrevistas)}</p>
                </div>
                <div className="p-4 bg-rose-50 rounded-lg border border-rose-100">
                  <p className="text-sm text-rose-600 font-medium">Já Pagas</p>
                  <p className="text-2xl font-bold text-rose-700">{fmt(totalDespesasPagas)}</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-600 font-medium">Em Aberto</p>
                  <p className="text-2xl font-bold text-amber-700">{fmt(totalDespesasAberto)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {/* Despesas em Aberto */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-amber-50/50 px-4 py-2 font-medium text-sm text-amber-700 flex justify-between">
                    <span>A Pagar ({openPayables.length})</span>
                    <span>{fmt(totalDespesasAberto)}</span>
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {openPayables.length > 0 ? openPayables.map(p => (
                      <div key={p.id} className="p-3 text-sm flex justify-between items-center hover:bg-slate-50/50">
                        <span className="truncate pr-2">{p.description}</span>
                        <div className="flex gap-4 items-center shrink-0">
                          <span className="text-slate-500 text-xs">{format(new Date(p.due_date), 'dd/MM/yyyy')}</span>
                          <span className="font-medium text-amber-600 w-20 text-right">{fmt(p.amount)}</span>
                        </div>
                      </div>
                    )) : <div className="p-4 text-center text-sm text-slate-500">Nenhuma despesa pendente</div>}
                  </div>
                </div>

                {/* Despesas Realizadas */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-rose-50/50 px-4 py-2 font-medium text-sm text-rose-700 flex justify-between">
                    <span>Pagas ({monthExpenses.length})</span>
                    <span>{fmt(totalDespesasPagas)}</span>
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {monthExpenses.length > 0 ? monthExpenses.map(t => (
                      <div key={t.id} className="p-3 text-sm flex justify-between items-center hover:bg-slate-50/50">
                        <span className="truncate pr-2">{t.description}</span>
                        <div className="flex gap-4 items-center shrink-0">
                          <span className="text-slate-500 text-xs">{format(new Date(t.date), 'dd/MM/yyyy')}</span>
                          <span className="font-medium text-rose-600 w-20 text-right">{fmt(t.amount)}</span>
                        </div>
                      </div>
                    )) : <div className="p-4 text-center text-sm text-slate-500">Nenhuma despesa registrada</div>}
                  </div>
                </div>
              </div>
            </section>

            {/* 3 & 4. Resultados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section>
                <h3 className="text-lg font-bold mb-4">3. Resultado Realizado</h3>
                <div className="bg-slate-50 p-5 rounded-xl border space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Recebido até agora</span>
                    <span className="font-medium text-emerald-600">{fmt(totalReceitasRecebidas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Gasto/pago até agora</span>
                    <span className="font-medium text-rose-600">{fmt(totalDespesasPagas)}</span>
                  </div>
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-semibold text-slate-800">Resultado Realizado</span>
                    <span className={`text-lg font-bold ${resultadoRealizado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(resultadoRealizado)}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold mb-4">4. Resultado Projetado</h3>
                <div className="bg-slate-50 p-5 rounded-xl border space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Previsto para Receber</span>
                    <span className="font-medium text-emerald-600">{fmt(totalReceitasPrevistas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Previsto para Gastar</span>
                    <span className="font-medium text-rose-600">{fmt(totalDespesasPrevistas)}</span>
                  </div>
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-semibold text-slate-800">Resultado Projetado</span>
                    <span className={`text-lg font-bold ${resultadoProjetado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(resultadoProjetado)}</span>
                  </div>
                </div>
              </section>
            </div>

            {/* 5. Saldo */}
            <section>
              <h3 className="text-lg font-bold mb-4">5. Resumo de Saldos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <p className="text-sm text-slate-600 font-medium">Saldo Inicial do Mês</p>
                  <p className={`text-xl font-bold ${saldoInicial >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(saldoInicial)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <p className="text-sm text-slate-600 font-medium">Saldo Atual Real</p>
                  <p className={`text-xl font-bold ${saldoAtualReal >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(saldoAtualReal)}</p>
                </div>
                <div className="p-4 bg-slate-100 rounded-lg border-2 border-primary/20">
                  <p className="text-sm text-primary font-medium">Saldo Final Projetado</p>
                  <p className={`text-xl font-bold ${saldoFinalProjetado >= 0 ? 'text-primary' : 'text-rose-600'}`}>{fmt(saldoFinalProjetado)}</p>
                </div>
              </div>
            </section>

            {/* 6. Resumo Executivo */}
            <section className="bg-primary/5 rounded-xl border border-primary/20 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5"/> 6. Resumo Executivo (IA)
                </h3>
                <Button variant="outline" size="sm" onClick={generateLLMSummary} disabled={isGeneratingLLM}>
                  {isGeneratingLLM ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Gerando...</> : <><RefreshCcw className="w-4 h-4 mr-2"/> Gerar Resumo</>}
                </Button>
              </div>
              
              {executiveSummary ? (
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-line">
                  {executiveSummary}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Clique no botão acima para gerar uma análise com Inteligência Artificial baseada nos seus números.</p>
                </div>
              )}
            </section>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}