import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import { Check, FileUp, Link2, Loader2, Plus, Search, AlertCircle, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Função de normalização super agressiva (tira acentos e caracteres especiais para não falhar na leitura)
const normalize = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); 
};

const toCents = (value) => Math.round(Math.abs(Number(value) || 0) * 100);
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (const char of line) {
    if (char === '"') insideQuotes = !insideQuotes;
    else if (char === delimiter && !insideQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += char;
  }

  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseAmount(rawValue) {
  const clean = String(rawValue || '').replace(/\s/g, '').replace(/R\$/gi, '');
  const isNegative = clean.includes('-') || /^\(.*\)$/.test(clean);
  const normalized = clean.replace(/[()]/g, '').replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(normalized) || 0;
  return isNegative ? -value : value;
}

function parseStatementDate(rawValue) {
  const value = String(rawValue || '').trim();
  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];

  for (const pattern of formats) {
    const parsed = parse(value, pattern, new Date());
    if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
  }

  const iso = parseISO(value);
  return isValid(iso) ? format(iso, 'yyyy-MM-dd') : '';
}

function resolveMovementType(rawType, amount) {
  const text = normalize(rawType);
  if (['entrada', 'credito', 'credit', 'income', 'receita'].some((term) => text.includes(term))) return 'income';
  if (['saida', 'debito', 'debit', 'expense', 'despesa'].some((term) => text.includes(term))) return 'expense';
  return Number(amount) < 0 ? 'expense' : 'income';
}

function postProcessCsv(rows) {
  const processed = [];
  let rentabSum = 0;
  let latestRentabDate = '';

  rows.forEach((row) => {
    // Agrupa todos os RENTAB.INVEST FACILCRED* do Bradesco
    if (row.description.toUpperCase().includes('RENTAB.INVEST FACILCRED*')) {
      const val = row.type === 'income' ? row.amount : -row.amount;
      rentabSum += val;
      if (!latestRentabDate || row.date > latestRentabDate) latestRentabDate = row.date;
    } else {
      processed.push(row);
    }
  });

  if (rentabSum !== 0) {
    processed.push({
      id: 'csv-rentab-grouped',
      date: latestRentabDate || new Date().toISOString().split('T')[0],
      description: 'Rendimentos Automáticos Bradesco',
      amount: Math.abs(rentabSum),
      type: rentabSum >= 0 ? 'income' : 'expense',
      preSelectedCategory: 'rendimentos',
      raw: [],
    });
  }

  return processed.sort((a, b) => a.date.localeCompare(b.date));
}

// NOVO PARSER INTELIGENTE (Preparado para Bradesco e CSVs Brasileiros)
function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  // 1. Achar a linha verdadeira de Cabeçalho (Ignora metadados do Bradesco no topo)
  let headerLineIndex = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCsvLine(lines[i], delimiter).map(normalize);
    if (cols.some(c => c.includes('data') || c.includes('date'))) {
      headerLineIndex = i;
      break;
    }
  }

  const headers = splitCsvLine(lines[headerLineIndex], delimiter).map(normalize);
  
  const dateIndex = headers.findIndex(h => h.includes('data') || h.includes('date'));
  const descriptionIndex = headers.findIndex(h => h.includes('hist') || h.includes('desc') || h.includes('memo') || h.includes('lancamento'));
  
  // 2. Detecção inteligente de colunas de Valores
  const creditIndex = headers.findIndex(h => h.includes('credito') || h.includes('dito') || h.includes('entrada')); 
  const debitIndex = headers.findIndex(h => h.includes('debito') || h.includes('bito') || h.includes('saida'));
  const amountIndex = headers.findIndex(h => h === 'valor' || h === 'amount' || h.includes('quantia'));
  const typeIndex = headers.findIndex(h => h.includes('tipo') || h.includes('movimenta'));

  const rawRows = lines.slice(headerLineIndex + 1).map((line, index) => {
    const columns = splitCsvLine(line, delimiter);
    if (columns.length < 3) return null;

    let amount = 0;
    let type = 'expense';

    // Se o banco tem colunas duplas (Bradesco, BB, Itaú)
    if (creditIndex >= 0 && debitIndex >= 0 && creditIndex !== debitIndex) {
      const creditVal = parseAmount(columns[creditIndex]);
      const debitVal = parseAmount(columns[debitIndex]);
      
      if (creditVal > 0) {
        amount = creditVal;
        type = 'income';
      } else if (debitVal > 0) {
        amount = debitVal;
        type = 'expense';
      } else {
        return null; // Linha inútil (saldo zerado)
      }
    } 
    // Se o banco tem coluna única (Nubank, Inter)
    else {
      const valCol = amountIndex >= 0 ? columns[amountIndex] : columns[2];
      const parsedVal = parseAmount(valCol);
      amount = Math.abs(parsedVal);
      if (amount === 0) return null;
      type = resolveMovementType(typeIndex >= 0 ? columns[typeIndex] : '', parsedVal);
    }

    const dateCol = columns[dateIndex >= 0 ? dateIndex : 0];
    const descCol = columns[descriptionIndex >= 0 ? descriptionIndex : 1];

    return {
      id: `csv-${index}`,
      date: parseStatementDate(dateCol),
      description: descCol || 'Lançamento do extrato',
      amount,
      type,
      raw: columns,
    };
  }).filter(Boolean).filter((row) => row.date && row.amount > 0);

  return postProcessCsv(rawRows);
}

function candidateDate(candidate) {
  return candidate.kind === 'payable' ? candidate.due_date : candidate.date;
}

function candidateType(candidate) {
  return candidate.kind === 'payable' ? 'expense' : candidate.type;
}

function isDateNear(statementDate, targetDate) {
  if (!statementDate || !targetDate) return false;
  return Math.abs(differenceInCalendarDays(startOfDay(parseISO(statementDate)), startOfDay(parseISO(targetDate)))) <= 2;
}

function buildCandidateLabel(candidate) {
  const date = candidateDate(candidate);
  const typeLabel = candidate.kind === 'payable' ? 'Conta a Pagar' : 'Transação';
  return `${typeLabel} • ${candidate.description} • ${formatCurrency(candidate.amount)} • ${date ? format(parseISO(date), 'dd/MM/yyyy') : 'sem data'}`;
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [statementRows, setStatementRows] = useState([]);
  const [manualMatches, setManualMatches] = useState({});
  const [confirmedRows, setConfirmedRows] = useState({});

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
    enabled: open,
  });

  const { data: payables = [], isLoading: loadingPayables } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
    enabled: open,
  });

  const candidates = useMemo(() => {
    const pendingPayables = payables
      .filter((payable) => ['pending', 'provisioned'].includes(payable.status || 'pending'))
      .map((payable) => ({ ...payable, kind: 'payable' }));

    const unreconciledTransactions = transactions
      .filter((transaction) => transaction.reconciled !== true)
      .map((transaction) => ({ ...transaction, kind: 'transaction' }));

    return [...pendingPayables, ...unreconciledTransactions];
  }, [payables, transactions]);

  const rowsWithMatches = useMemo(() => statementRows.map((row) => {
    const manualMatch = manualMatches[row.id];
    const automaticMatch = candidates.find((candidate) => (
      toCents(candidate.amount) === toCents(row.amount)
      && candidateType(candidate) === row.type
      && isDateNear(row.date, candidateDate(candidate))
    ));

    const finalMatch = manualMatch || automaticMatch || null;
    const hasValueDivergence = finalMatch && toCents(finalMatch.amount) !== toCents(row.amount);

    return {
      ...row,
      match: finalMatch,
      matchSource: manualMatch ? 'manual' : automaticMatch ? 'auto' : null,
      hasValueDivergence,
    };
  }), [statementRows, candidates, manualMatches]);

  const automaticMatchesCount = rowsWithMatches.filter((row) => row.matchSource === 'auto' && !confirmedRows[row.id]).length;

  const reconcileMutation = useMutation({
    mutationFn: async (row) => {
      if (!row.match) {
        await base44.entities.Transaction.create({
          description: row.description,
          amount: row.amount,
          type: row.type,
          date: row.date,
          category: row.preSelectedCategory || undefined,
          source: 'manual',
          reconciled: true,
          notes: row.preSelectedCategory ? 'Agrupado via importação de extrato' : 'Criado via Extrato (Órfão)',
        });
        return row.id;
      }

      if (row.match.kind === 'transaction') {
        await base44.entities.Transaction.update(row.match.id, {
          amount: row.amount, 
          date: row.date,    
          reconciled: true,
          notes: row.match.notes || 'Conciliado com extrato',
        });
        return row.id;
      }

      const transaction = await base44.entities.Transaction.create({
        description: row.description || row.match.description,
        amount: row.amount,
        type: 'expense',
        category: row.match.category,
        date: row.date,
        source: 'manual',
        payable_id: row.match.id,
        reconciled: true,
        notes: 'Pagamento conciliado com extrato',
      });

      await base44.entities.Payable.update(row.match.id, {
        amount: row.amount, 
        status: 'paid',
        transaction_id: transaction.id,
      });

      return row.id;
    },
    onSuccess: (rowId) => {
      setConfirmedRows((previous) => ({ ...previous, [rowId]: true }));
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      toast.success('Lançamento conciliado.');
    },
    onError: () => {
      toast.error('Erro ao conciliar. Tente novamente.');
    }
  });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setStatementRows(parseCsv(loadEvent.target.result || ''));
      setManualMatches({});
      setConfirmedRows({});
    };
    // Leitura em padrão ISO resolve os bugs de acentuação do Windows-1252 dos bancos
    reader.readAsText(file, 'ISO-8859-1');
  };

  const confirmAllAutomatic = async () => {
    const rows = rowsWithMatches.filter((row) => row.matchSource === 'auto' && !confirmedRows[row.id]);
    for (const row of rows) await reconcileMutation.mutateAsync(row);
    toast.success('Matches automáticos processados.');
  };

  const handleClose = (nextOpen) => {
    if (!nextOpen) {
      setStatementRows([]);
      setManualMatches({});
      setConfirmedRows({});
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    onOpenChange?.(nextOpen);
  };

  const isLoading = loadingTransactions || loadingPayables;

  const incomeRows = rowsWithMatches.filter(r => r.type === 'income');
  const expenseRows = rowsWithMatches.filter(r => r.type === 'expense');

  const RowComponent = ({ row }) => (
    <TableRow key={row.id} className={`${confirmedRows[row.id] ? 'bg-emerald-50/50 opacity-60' : 'hover:bg-slate-50'} transition-all`}>
      <TableCell className="whitespace-nowrap font-bold text-slate-600 text-xs">{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
      <TableCell className="max-w-[280px] truncate font-bold text-slate-800 text-sm">
        {row.description}
        {row.preSelectedCategory && (
          <Badge variant="outline" className="ml-2 text-[9px] text-slate-400 uppercase">Consolidado</Badge>
        )}
      </TableCell>
      <TableCell className="border-r text-right font-black text-sm">{formatCurrency(row.amount)}</TableCell>
      
      <TableCell className="max-w-[360px]">
        {row.match ? (
          <div className="space-y-1">
            <p className="truncate text-sm font-bold text-slate-700">{row.match.description}</p>
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-100 text-slate-600 border-none text-[9px] px-1.5 uppercase font-bold">
                {row.match.kind === 'payable' ? 'CONTA' : 'TRANSAÇÃO'}
              </Badge>
              <span className={`text-xs font-bold ${row.hasValueDivergence ? 'text-amber-600 line-through' : 'text-slate-500'}`}>
                {formatCurrency(row.match.amount)}
              </span>
            </div>
            {row.hasValueDivergence && !confirmedRows[row.id] && (
              <p className="text-[10px] font-bold text-amber-600 flex items-center mt-1">
                <AlertCircle className="w-3 h-3 mr-1" />
                O valor será ajustado.
              </p>
            )}
          </div>
        ) : (
          <span className="text-[11px] font-bold text-slate-400 uppercase">Não encontrada</span>
        )}
      </TableCell>
      
      <TableCell>
        {confirmedRows[row.id] ? (
          <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold uppercase text-[9px]">CONCILIADO</Badge>
        ) : row.matchSource === 'auto' ? (
          <Badge className="bg-blue-100 text-blue-700 border-none font-bold uppercase text-[9px]">MATCH AUTO</Badge>
        ) : row.matchSource === 'manual' ? (
          <Badge className="bg-purple-100 text-purple-700 border-none font-bold uppercase text-[9px]">VÍNCULO MANUAL</Badge>
        ) : (
          <Badge className="bg-slate-100 text-slate-500 border-none font-bold uppercase text-[9px]">ÓRFÃO</Badge>
        )}
      </TableCell>
      
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {!confirmedRows[row.id] && row.match && (
            <Button size="sm" onClick={() => reconcileMutation.mutate(row)} disabled={reconcileMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 font-bold h-8 text-xs">
              <Check className="h-4 w-4 mr-1" /> CONCILIAR
            </Button>
          )}

          {!confirmedRows[row.id] && !row.match && (
            <Button size="sm" variant="outline" onClick={() => reconcileMutation.mutate(row)} disabled={reconcileMutation.isPending} className="font-bold text-slate-600 h-8 text-xs">
              <Plus className="h-4 w-4 mr-1" /> CRIAR NOVO
            </Button>
          )}

          {!confirmedRows[row.id] && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-primary">
                  <Search className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[420px] p-0 font-sora">
                <Command>
                  <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                    <CommandInput placeholder="Buscar transação no sistema..." className="text-sm font-medium" />
                  </div>
                  <CommandList>
                    <CommandEmpty className="py-6 text-center text-sm font-medium text-slate-500">Sem resultados.</CommandEmpty>
                    <CommandGroup heading={<span className="text-xs font-bold text-slate-400 uppercase tracking-widest">PENDENTES DE CONCILIAÇÃO</span>}>
                      {candidates
                        .filter(c => candidateType(c) === row.type)
                        .map((candidate) => (
                        <CommandItem
                          key={`${candidate.kind}-${candidate.id}`}
                          value={buildCandidateLabel(candidate)}
                          onSelect={() => setManualMatches((previous) => ({ ...previous, [row.id]: candidate }))}
                          className="cursor-pointer"
                        >
                          <div className="flex w-full items-center justify-between gap-3 py-1">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-800">{candidate.description}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{candidate.kind === 'payable' ? 'CONTA' : 'TRANSAÇÃO'}</p>
                            </div>
                            <span className="shrink-0 text-sm font-black text-slate-900">{formatCurrency(candidate.amount)}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          {confirmedRows[row.id] && <Check className="h-5 w-5 text-emerald-500 mr-2" />}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col max-h-[90vh] max-w-7xl overflow-hidden p-0 font-sora">
        
        <DialogHeader className="border-b px-6 py-5 bg-slate-50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileUp className="h-5 w-5 text-primary" />
            Conciliação de Extrato Bancário
          </DialogTitle>
          <DialogDescription className="text-sm font-medium">
            O valor do extrato importado será considerado a "Verdade Absoluta" e sobrescreverá qualquer previsão no sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between shadow-sm">
            <div className="flex flex-1 items-center gap-3">
              <Input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="max-w-md bg-slate-50 cursor-pointer font-bold" />
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <Button
              onClick={confirmAllAutomatic}
              disabled={automaticMatchesCount === 0 || reconcileMutation.isPending}
              className="w-full md:w-auto font-bold bg-primary"
            >
              {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              CONFIRMAR TODOS OS AUTOMÁTICOS ({automaticMatchesCount})
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/80">
                  <TableHead colSpan={3} className="border-r text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                    VISÃO DO EXTRATO BANCÁRIO (CSV)
                  </TableHead>
                  <TableHead colSpan={3} className="text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                    MATCH NO SISTEMA E AÇÃO
                  </TableHead>
                </TableRow>
                <TableRow className="text-[11px] uppercase tracking-wider font-bold">
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="border-r text-right">Valor</TableHead>
                  <TableHead>Correspondência Encontrada</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Nenhum arquivo processado
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {incomeRows.length > 0 && (
                      <>
                        <TableRow className="bg-emerald-50 hover:bg-emerald-50">
                          <TableCell colSpan={6} className="font-black text-emerald-800 text-xs tracking-widest uppercase py-2">
                            RECEITAS / ENTRADAS
                          </TableCell>
                        </TableRow>
                        {incomeRows.map(row => <RowComponent key={row.id} row={row} />)}
                      </>
                    )}

                    {expenseRows.length > 0 && (
                      <>
                        <TableRow className="bg-red-50 hover:bg-red-50">
                          <TableCell colSpan={6} className="font-black text-red-800 text-xs tracking-widest uppercase py-2 border-t">
                            DESPESAS / SAÍDAS
                          </TableCell>
                        </TableRow>
                        {expenseRows.map(row => <RowComponent key={row.id} row={row} />)}
                      </>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 bg-slate-50 shrink-0">
          <Button variant="outline" onClick={() => handleClose(false)} className="font-bold w-full md:w-auto">FECHAR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}