import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { Check, FileUp, Loader2, Search, AlertCircle, EyeOff, Undo2, Eye } from 'lucide-react';
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

const normalizeToLetters = (value) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, ''); 
};

const toCents = (value) => Math.round(Math.abs(Number(value) || 0) * 100);
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

function matchesBankAmount(record, bankAmount) {
  const bankCents = toCents(bankAmount);
  return [record.amount, record.net_amount]
    .filter((value) => value !== undefined && value !== null)
    .some((value) => toCents(value) === bankCents);
}

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

function postProcessCsv(rows) {
  const processed = [];
  let rentabSum = 0;
  let latestRentabDate = '';

  rows.forEach((row) => {
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

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  let headerLineIndex = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCsvLine(lines[i], delimiter).map(normalizeToLetters);
    if (cols.some(c => c.includes('data') || c.includes('date'))) {
      headerLineIndex = i;
      break;
    }
  }

  const rawHeaders = splitCsvLine(lines[headerLineIndex], delimiter);
  const headersLetters = rawHeaders.map(normalizeToLetters);
  
  const dateIndex = headersLetters.findIndex(h => h.includes('data') || h.includes('date'));
  const descriptionIndex = headersLetters.findIndex(h => h.includes('hist') || h.includes('desc') || h.includes('memo') || h.includes('lancamento'));
  
  let creditIndex = headersLetters.findIndex(h => h.includes('credito') || h.includes('entrada')); 
  let debitIndex = headersLetters.findIndex(h => h.includes('debito') || h.includes('saida'));
  let amountIndex = headersLetters.findIndex(h => h === 'valor' || h === 'amount' || h.includes('quantia'));

  const isBradesco = headersLetters.some(h => h.includes('docto') || h.includes('documento'));
  if (isBradesco) {
    creditIndex = 3; 
    debitIndex = 4;
  }

  const rawRows = lines.slice(headerLineIndex + 1).map((line, index) => {
    const columns = splitCsvLine(line, delimiter);
    if (columns.length < 3) return null;

    let amount = 0;
    let type = 'expense';

    if (creditIndex >= 0 && debitIndex >= 0 && creditIndex !== debitIndex && columns.length > debitIndex) {
      const creditVal = parseAmount(columns[creditIndex]);
      const debitVal = parseAmount(columns[debitIndex]);
      
      if (creditVal > 0) {
        amount = creditVal;
        type = 'income';
      } else if (debitVal > 0) {
        amount = debitVal;
        type = 'expense';
      } else {
        return null;
      }
    } else {
      const valCol = amountIndex >= 0 ? columns[amountIndex] : columns[2];
      const parsedVal = parseAmount(valCol);
      amount = Math.abs(parsedVal);
      if (amount === 0) return null;
      type = parsedVal < 0 ? 'expense' : 'income';
    }

    return {
      id: `csv-${index}`,
      date: parseStatementDate(columns[dateIndex >= 0 ? dateIndex : 0]),
      description: columns[descriptionIndex >= 0 ? descriptionIndex : 1] || 'Lançamento do extrato',
      amount,
      type,
      raw: columns,
    };
  }).filter(Boolean).filter((row) => row.date && row.amount > 0);

  return postProcessCsv(rawRows);
}

function candidateDate(candidate) {
  if (candidate.kind === 'payable') return candidate.due_date;
  if (candidate.kind === 'receivable') return candidate.due_date;
  return candidate.date;
}

function isDateNear(statementDate, targetDate) {
  if (!statementDate || !targetDate) return false;
  try {
    const sDate = String(statementDate).substring(0, 10);
    const tDate = String(targetDate).substring(0, 10);
    return Math.abs(differenceInCalendarDays(parseISO(sDate), parseISO(tDate))) <= 4;
  } catch (e) {
    return false;
  }
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({});
  const [hideProcessed, setHideProcessed] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 1000),
    enabled: open,
  });

  const { data: payables = [], isLoading: loadingPayables } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
    enabled: open,
  });

  const { data: receivables = [], isLoading: loadingReceivables } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 500),
    enabled: open,
  });

  const { candidates, reconciledTransactions } = useMemo(() => {
    const reconciled = transactions.filter(t => t.reconciled === true).map(t => ({ ...t, kind: 'transaction' }));
    const pendingTransactions = transactions.filter(t => t.reconciled !== true).map(t => ({ ...t, kind: 'transaction' }));
    const pendingPayables = payables.filter(p => ['pending', 'provisioned'].includes(p.status || 'pending')).map(p => ({ ...p, kind: 'payable' }));
    const pendingReceivables = receivables.filter(r => ['pending', 'provisioned'].includes(r.status || 'pending')).map(r => ({ ...r, kind: 'receivable' }));

    return { 
      reconciledTransactions: reconciled, 
      candidates: [...pendingPayables, ...pendingReceivables, ...pendingTransactions] 
    };
  }, [payables, receivables, transactions]);

  const rowsWithState = useMemo(() => {
    const poolReconciled = [...reconciledTransactions];
    const poolCandidates = [...candidates];

    return statementRows.map((row) => {
      if (ignoredRows[row.id]) return { ...row, status: 'to_ignore' };

      const processedIdx = poolReconciled.findIndex(t => 
        matchesBankAmount(t, row.amount) &&
        isDateNear(t.date, row.date)
      );

      if (processedIdx !== -1) {
        const match = poolReconciled[processedIdx];
        poolReconciled.splice(processedIdx, 1); 
        return { ...row, status: 'processed', match };
      }

      if (manualMatches[row.id]) return { ...row, status: 'manual_match', match: manualMatches[row.id] };

      const autoIdx = poolCandidates.findIndex(c => 
        matchesBankAmount(c, row.amount) &&
        isDateNear(candidateDate(c), row.date)
      );

      if (autoIdx !== -1) {
        const match = poolCandidates[autoIdx];
        poolCandidates.splice(autoIdx, 1);
        return { ...row, status: 'auto_match', match };
      }

      return { ...row, status: 'orphan' };
    });
  }, [statementRows, candidates, reconciledTransactions, ignoredRows, manualMatches]);

  const itemsToProcess = rowsWithState.filter(r => r.status !== 'processed').length;

  const executeBatchMutation = useMutation({
    mutationFn: async () => {
      const toProcess = rowsWithState.filter(r => r.status !== 'processed');

      for (const row of toProcess) {
        if (row.status === 'to_ignore') {
          await base44.entities.Transaction.create({
            description: row.description,
            amount: row.amount,
            type: 'ignored',
            category: 'ignored',
            date: row.date,
            source: 'manual',
            reconciled: true,
            notes: 'Ignorado via conciliação em lote',
          });
        } 
        else if (row.status === 'orphan') {
          await base44.entities.Transaction.create({
            description: row.description,
            amount: row.amount,
            type: row.type,
            category: row.preSelectedCategory || undefined,
            date: row.date,
            source: 'manual',
            reconciled: true,
            notes: row.preSelectedCategory ? 'Agrupado via importação' : 'Criado via Extrato (Órfão)',
          });
        } 
        else if (row.status === 'auto_match' || row.status === 'manual_match') {
          if (row.match.kind === 'transaction') {
            await base44.entities.Transaction.update(row.match.id, {
              amount: row.amount, 
              date: row.date,    
              type: row.type, 
              reconciled: true,
              notes: row.match.notes || 'Conciliado com extrato',
            });
          } else if (row.match.kind === 'payable') {
            const transaction = await base44.entities.Transaction.create({
              description: row.description || row.match.description,
              amount: row.amount,
              type: row.type, 
              category: row.match.category,
              date: row.date,
              source: 'manual',
              payable_id: row.match.id,
              reconciled: true,
              notes: 'Pagamento de despesa conciliado em lote',
            });
            await base44.entities.Payable.update(row.match.id, {
              amount: row.amount, 
              status: 'paid',
              transaction_id: transaction.id,
            });
          } else if (row.match.kind === 'receivable') {
            const transaction = await base44.entities.Transaction.create({
              description: row.description || row.match.description,
              amount: row.match.amount || row.amount,
              net_amount: row.amount,
              type: row.type, 
              category: row.match.category,
              date: row.date,
              source: 'manual',
              receivable_id: row.match.id,
              reconciled: true,
              notes: 'Receita conciliada em lote',
            });
            await base44.entities.Receivable.update(row.match.id, {
              net_amount: row.amount, 
              status: 'received',
              transaction_id: transaction.id,
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payables-list'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast.success('Auditoria concluída com sucesso!');
      handleClose(false);
    },
    onError: () => {
      toast.error('Erro na execução em lote. Tente novamente.');
    }
  });

  const resetReviewState = () => {
    setManualMatches({});
    setIgnoredRows({});
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
    const isCsv = file.type.includes('csv') || fileName.endsWith('.csv');

    if (isPdf) {
      setParsingPdf(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('extractBankStatementPDF', { file_url });
      setStatementRows(postProcessCsv(response.data.rows || []));
      resetReviewState();
      setParsingPdf(false);
      return;
    }

    if (!isCsv) {
      toast.error('Envie um arquivo CSV ou PDF');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setStatementRows(parseCsv(loadEvent.target.result || ''));
      resetReviewState();
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleClose = (nextOpen) => {
    if (!nextOpen) {
      setStatementRows([]);
      setManualMatches({});
      setIgnoredRows({});
      setParsingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    onOpenChange?.(nextOpen);
  };

  const toggleIgnore = (rowId) => {
    setIgnoredRows(prev => {
      const next = { ...prev };
      if (next[rowId]) delete next[rowId];
      else next[rowId] = true;
      return next;
    });
  };

  const isLoading = loadingTransactions || loadingPayables || loadingReceivables || parsingPdf;
  
  const displayRows = hideProcessed ? rowsWithState.filter(r => r.status !== 'processed') : rowsWithState;
  
  const incomeRows = displayRows.filter(r => r.type === 'income').sort((a, b) => a.date.localeCompare(b.date));
  const expenseRows = displayRows.filter(r => r.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));

  const renderRow = (row) => {
    const isProcessed = row.status === 'processed';
    const isIgnored = row.status === 'to_ignore';
    
    let badgeClass = "bg-slate-100 text-slate-500";
    if (row.status === 'auto_match' || row.status === 'manual_match') badgeClass = "bg-green-100 text-green-700";
    if (row.status === 'orphan') badgeClass = "bg-red-100 text-red-700";
    
    return (
      <TableRow key={row.id} className={`${isProcessed || isIgnored ? 'bg-slate-50/50 opacity-50 grayscale' : 'hover:bg-slate-50'} transition-all`}>
        <TableCell className="whitespace-nowrap font-bold text-slate-600 text-xs">{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
        <TableCell className="max-w-[450px] truncate font-bold text-slate-800 text-sm">
          {row.description}
        </TableCell>
        <TableCell className="border-r text-right font-black text-sm">{formatCurrency(row.amount)}</TableCell>
        <TableCell className="max-w-[500px]">
          {row.match ? (
              <p className={`truncate text-sm font-bold ${isProcessed ? 'text-slate-500' : 'text-slate-700'}`}>{row.match.description}</p>
          ) : (
              <span className="text-[11px] font-bold text-slate-400 uppercase">Nenhum vínculo</span>
          )}
        </TableCell>
        <TableCell>
          <Badge className={`${badgeClass} border-none font-bold uppercase text-[9px]`}>
              {row.status === 'processed' ? 'Já Salvo no Banco' : 
               row.status === 'auto_match' || row.status === 'manual_match' ? 'Conciliado - Match' :
               row.status === 'to_ignore' ? 'Ignorado' : 'Órfão'}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleIgnore(row.id)}>
                  {row.status === 'to_ignore' ? <Undo2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              {row.status === 'orphan' && (
                  <Popover>
                      <PopoverTrigger asChild>
                          <Button size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0">
                          <Command>
                              <CommandInput />
                              <CommandList className="max-h-[300px] overflow-y-auto">
                                  <CommandGroup>
                                      {candidates.filter(c => {
                                          const cType = c.kind === 'transaction' ? c.type : (c.kind === 'receivable' ? 'receivable' : 'payable');
                                          if (row.type === 'income') {
                                              return ['receivable', 'income', 'transfer'].includes(cType);
                                          } else {
                                              return ['payable', 'expense', 'transfer'].includes(cType);
                                          }
                                      }).map(c => (
                                          <CommandItem key={c.id} onSelect={() => setManualMatches({...manualMatches, [row.id]: c})}>
                                              {c.description} - {formatCurrency(c.amount)}
                                          </CommandItem>
                                      ))}
                                  </CommandGroup>
                              </CommandList>
                          </Command>
                      </PopoverContent>
                  </Popover>
              )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col max-h-[90vh] max-w-[95vw] p-0 font-sora">
        <DialogHeader className="border-b px-6 py-5 bg-slate-50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileUp className="h-5 w-5 text-primary" />
            Mesa de Conciliação em Lote
          </DialogTitle>
          <DialogDescription className="text-sm font-medium">
            O valor e o tipo do extrato bancário dão a palavra final. Nada é salvo no banco até você mandar executar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/30">
          <div className="p-6 space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between shadow-sm sticky top-0 z-10">
              <div className="flex flex-1 items-center gap-3">
                <Input ref={fileInputRef} type="file" accept=".csv,text/csv,application/pdf,.pdf" onChange={handleFileChange} className="max-w-md bg-slate-50 cursor-pointer font-bold" />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {parsingPdf && <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Processando PDF...</span>}
                <Button variant="outline" onClick={() => setHideProcessed(!hideProcessed)}>
                    {hideProcessed ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                    {hideProcessed ? "Mostrar Processados" : "Ocultar Processados"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => executeBatchMutation.mutate()}
                  disabled={itemsToProcess === 0 || executeBatchMutation.isPending}
                  className="w-full md:w-auto font-bold bg-primary px-8"
                >
                  {executeBatchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  EXECUTAR CONCILIAÇÃO ({itemsToProcess} ITENS)
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100/80">
                    <TableHead colSpan={3} className="border-r text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                      VISÃO DO EXTRATO BANCÁRIO (CSV/PDF)
                    </TableHead>
                    <TableHead colSpan={3} className="text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                      DIAGNÓSTICO E REVISÃO
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
                  {displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                        Nenhum arquivo processado
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {incomeRows.length > 0 && (
                        <>
                          <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
                            <TableCell colSpan={6} className="text-center font-black uppercase text-[11px] tracking-widest text-slate-600 py-3">
                              Entradas / Receitas
                            </TableCell>
                          </TableRow>
                          {incomeRows.map(renderRow)}
                        </>
                      )}
                      
                      {expenseRows.length > 0 && (
                        <>
                          <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
                            <TableCell colSpan={6} className="text-center font-black uppercase text-[11px] tracking-widest text-slate-600 py-3">
                              Saídas / Despesas
                            </TableCell>
                          </TableRow>
                          {expenseRows.map(renderRow)}
                        </>
                      )}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}