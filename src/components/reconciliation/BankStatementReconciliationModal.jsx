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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ... [Mantive todas as funções utilitárias que você enviou] ...
const normalizeToLetters = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''); 
const toCents = (value) => Math.round(Math.abs(Number(value) || 0) * 100);
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

function matchesBankAmount(record, bankAmount) {
  const bankCents = toCents(bankAmount);
  return [record.amount, record.net_amount].filter((value) => value !== undefined && value !== null).some((value) => toCents(value) === bankCents);
}
function splitCsvLine(line, delimiter) {
  const result = []; let current = ''; let insideQuotes = false;
  for (const char of line) { if (char === '"') insideQuotes = !insideQuotes; else if (char === delimiter && !insideQuotes) { result.push(current.trim().replace(/^"|"$/g, '')); current = ''; } else current += char; }
  result.push(current.trim().replace(/^"|"$/g, '')); return result;
}
function parseAmount(rawValue) {
  const clean = String(rawValue || '').replace(/\s/g, '').replace(/R\$/gi, '');
  const isNegative = clean.includes('-') || /^\(.*\)$/.test(clean);
  const normalized = clean.replace(/[()]/g, '').replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(normalized) || 0; return isNegative ? -value : value;
}
function parseStatementDate(rawValue) {
  const value = String(rawValue || '').trim();
  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
  for (const pattern of formats) { const parsed = parse(value, pattern, new Date()); if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd'); }
  const iso = parseISO(value); return isValid(iso) ? format(iso, 'yyyy-MM-dd') : '';
}
function postProcessCsv(rows) {
  const processed = []; let rentabSum = 0; let latestRentabDate = '';
  rows.forEach((row) => {
    if (row.description.toUpperCase().includes('RENTAB.INVEST FACILCRED*')) {
      const val = row.type === 'income' ? row.amount : -row.amount; rentabSum += val;
      if (!latestRentabDate || row.date > latestRentabDate) latestRentabDate = row.date;
    } else { processed.push(row); }
  });
  if (rentabSum !== 0) {
    processed.push({ id: 'csv-rentab-grouped', date: latestRentabDate || new Date().toISOString().split('T')[0], description: 'Rendimentos Automáticos Bradesco', amount: Math.abs(rentabSum), type: rentabSum >= 0 ? 'income' : 'expense', preSelectedCategory: 'rendimentos', raw: [] });
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
    if (cols.some(c => c.includes('data') || c.includes('date'))) { headerLineIndex = i; break; }
  }
  const rawHeaders = splitCsvLine(lines[headerLineIndex], delimiter);
  const headersLetters = rawHeaders.map(normalizeToLetters);
  const dateIndex = headersLetters.findIndex(h => h.includes('data') || h.includes('date'));
  const descriptionIndex = headersLetters.findIndex(h => h.includes('hist') || h.includes('desc') || h.includes('memo') || h.includes('lancamento'));
  let creditIndex = headersLetters.findIndex(h => h.includes('credito') || h.includes('entrada')); 
  let debitIndex = headersLetters.findIndex(h => h.includes('debito') || h.includes('saida'));
  let amountIndex = headersLetters.findIndex(h => h === 'valor' || h === 'amount' || h.includes('quantia'));
  const isBradesco = headersLetters.some(h => h.includes('docto') || h.includes('documento'));
  if (isBradesco) { creditIndex = 3; debitIndex = 4; }
  const rawRows = lines.slice(headerLineIndex + 1).map((line, index) => {
    const columns = splitCsvLine(line, delimiter);
    if (columns.length < 3) return null;
    let amount = 0; let type = 'expense';
    if (creditIndex >= 0 && debitIndex >= 0 && creditIndex !== debitIndex && columns.length > debitIndex) {
      const creditVal = parseAmount(columns[creditIndex]);
      const debitVal = parseAmount(columns[debitIndex]);
      if (creditVal > 0) { amount = creditVal; type = 'income'; } else if (debitVal > 0) { amount = debitVal; type = 'expense'; } else { return null; }
    } else {
      const valCol = amountIndex >= 0 ? columns[amountIndex] : columns[2];
      const parsedVal = parseAmount(valCol); amount = Math.abs(parsedVal);
      if (amount === 0) return null; type = parsedVal < 0 ? 'expense' : 'income';
    }
    return { id: `csv-${index}`, date: parseStatementDate(columns[dateIndex >= 0 ? dateIndex : 0]), description: columns[descriptionIndex >= 0 ? descriptionIndex : 1] || 'Lançamento do extrato', amount, type, raw: columns };
  }).filter(Boolean).filter((row) => row.date && row.amount > 0);
  return postProcessCsv(rawRows);
}

function candidateDate(candidate) { if (candidate.kind === 'payable') return candidate.due_date; if (candidate.kind === 'receivable') return candidate.due_date; return candidate.date; }
function isDateNear(statementDate, targetDate) {
  if (!statementDate || !targetDate) return false;
  try { const sDate = String(statementDate).substring(0, 10); const tDate = String(targetDate).substring(0, 10); return Math.abs(differenceInCalendarDays(parseISO(sDate), parseISO(tDate))) <= 4; } catch (e) { return false; }
}
function buildCandidateLabel(candidate) {
  const date = candidateDate(candidate);
  const typeLabel = candidate.kind === 'payable' ? 'A Pagar' : candidate.kind === 'receivable' ? 'A Receber' : 'Transação';
  return `${typeLabel} • ${candidate.description} • ${formatCurrency(candidate.amount)} • ${date ? format(parseISO(date.substring(0, 10)), 'dd/MM/yyyy') : 'sem data'}`;
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({});
  const [hideProcessed, setHideProcessed] = useState(false); // ESTADO DO TOGGLE

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.list('-date', 1000), enabled: open });
  const { data: payables = [], isLoading: loadingPayables } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500), enabled: open });
  const { data: receivables = [], isLoading: loadingReceivables } = useQuery({ queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 500), enabled: open });

  const { candidates, reconciledTransactions } = useMemo(() => {
    const reconciled = transactions.filter(t => t.reconciled === true).map(t => ({ ...t, kind: 'transaction' }));
    const pendingTransactions = transactions.filter(t => t.reconciled !== true).map(t => ({ ...t, kind: 'transaction' }));
    const pendingPayables = payables.filter(p => ['pending', 'provisioned'].includes(p.status || 'pending')).map(p => ({ ...p, kind: 'payable' }));
    const pendingReceivables = receivables.filter(r => ['pending', 'provisioned'].includes(r.status || 'pending')).map(r => ({ ...r, kind: 'receivable' }));
    return { reconciledTransactions: reconciled, candidates: [...pendingPayables, ...pendingReceivables, ...pendingTransactions] };
  }, [payables, receivables, transactions]);

  const rowsWithState = useMemo(() => {
    const poolReconciled = [...reconciledTransactions];
    const poolCandidates = [...candidates];
    return statementRows.map((row) => {
      if (ignoredRows[row.id]) return { ...row, status: 'to_ignore' };
      const processedIdx = poolReconciled.findIndex(t => matchesBankAmount(t, row.amount) && isDateNear(t.date, row.date));
      if (processedIdx !== -1) { const match = poolReconciled[processedIdx]; poolReconciled.splice(processedIdx, 1); return { ...row, status: 'processed', match }; }
      if (manualMatches[row.id]) return { ...row, status: 'manual_match', match: manualMatches[row.id] };
      const autoIdx = poolCandidates.findIndex(c => matchesBankAmount(c, row.amount) && isDateNear(candidateDate(c), row.date));
      if (autoIdx !== -1) { const match = poolCandidates[autoIdx]; poolCandidates.splice(autoIdx, 1); return { ...row, status: 'auto_match', match }; }
      return { ...row, status: 'orphan' };
    });
  }, [statementRows, candidates, reconciledTransactions, ignoredRows, manualMatches]);

  // Aplica o filtro de visualização
  const visibleRows = useMemo(() => hideProcessed ? rowsWithState.filter(r => r.status !== 'processed') : rowsWithState, [rowsWithState, hideProcessed]);

  const itemsToProcess = rowsWithState.filter(r => r.status !== 'processed').length;

  const executeBatchMutation = useMutation({
    mutationFn: async () => {
      for (const row of rowsWithState.filter(r => r.status !== 'processed')) {
        if (row.status === 'to_ignore') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'ignored', category: 'ignored', date: row.date, source: 'manual', reconciled: true });
        else if (row.status === 'orphan') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: row.type, date: row.date, source: 'manual', reconciled: true });
        else if (row.status === 'auto_match' || row.status === 'manual_match') {
          if (row.match.kind === 'transaction') await base44.entities.Transaction.update(row.match.id, { amount: row.amount, reconciled: true, type: row.type });
          else if (row.match.kind === 'payable') {
            const transaction = await base44.entities.Transaction.create({ description: row.description || row.match.description, amount: row.amount, type: row.type, category: row.match.category, date: row.date, source: 'manual', payable_id: row.match.id, reconciled: true });
            await base44.entities.Payable.update(row.match.id, { amount: row.amount, status: 'paid', transaction_id: transaction.id });
          } else if (row.match.kind === 'receivable') {
            const transaction = await base44.entities.Transaction.create({ description: row.description || row.match.description, amount: row.match.amount || row.amount, net_amount: row.amount, type: row.type, category: row.match.category, date: row.date, source: 'manual', receivable_id: row.match.id, reconciled: true });
            await base44.entities.Receivable.update(row.match.id, { net_amount: row.amount, status: 'received', transaction_id: transaction.id });
          }
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Auditoria concluída!'); handleClose(false); },
    onError: () => toast.error('Erro na execução.')
  });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => { setStatementRows(parseCsv(loadEvent.target.result || '')); setManualMatches({}); setIgnoredRows({}); };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleClose = (nextOpen) => {
    if (!nextOpen) { setStatementRows([]); setManualMatches({}); setIgnoredRows({}); if (fileInputRef.current) fileInputRef.current.value = ''; }
    onOpenChange?.(nextOpen);
  };

  const toggleIgnore = (rowId) => {
    setIgnoredRows(prev => { const next = { ...prev }; if (next[rowId]) delete next[rowId]; else next[rowId] = true; return next; });
  };

  const incomeRows = visibleRows.filter(r => r.type === 'income');
  const expenseRows = visibleRows.filter(r => r.type === 'expense');

  const RowComponent = ({ row }) => (
      <TableRow className={`${row.status === 'processed' ? 'opacity-50 bg-slate-50' : ''}`}>
        <TableCell className="text-xs font-bold">{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
        <TableCell className="text-sm font-bold">{row.description}</TableCell>
        <TableCell className="text-sm font-black">{formatCurrency(row.amount)}</TableCell>
        <TableCell className="text-sm font-bold text-slate-600">{row.match?.description || '---'}</TableCell>
        <TableCell>
            <Badge variant="outline" className="text-[9px] uppercase">{row.status}</Badge>
        </TableCell>
        <TableCell>
            <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggleIgnore(row.id)}>
                    {ignoredRows[row.id] ? <Undo2 className="h-4 w-4"/> : <EyeOff className="h-4 w-4"/>}
                </Button>
                {row.status === 'orphan' && (
                    <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="sm"><Search className="h-4 w-4"/></Button></PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0"><Command><CommandInput/><CommandList className="max-h-[300px] overflow-y-auto"><CommandGroup>{candidates.map(c => <CommandItem key={c.id} onSelect={() => setManualMatches({...manualMatches, [row.id]: c})}>{c.description}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
                    </Popover>
                )}
            </div>
        </TableCell>
      </TableRow>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Mesa de Conciliação em Lote</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 p-4">
            <Input ref={fileInputRef} type="file" onChange={handleFileChange} />
            <Button variant={hideProcessed ? "default" : "outline"} onClick={() => setHideProcessed(!hideProcessed)}>
                {hideProcessed ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                {hideProcessed ? "Mostrar Processados" : "Ocultar Processados"}
            </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
            <Table>
                <TableBody>
                    {incomeRows.length > 0 && <><TableRow><TableCell colSpan={6} className="bg-slate-100 font-bold">RECEITAS</TableCell></TableRow>{incomeRows.map(r => <RowComponent key={r.id} row={r}/>)}</>}
                    {expenseRows.length > 0 && <><TableRow><TableCell colSpan={6} className="bg-slate-100 font-bold">DESPESAS</TableCell></TableRow>{expenseRows.map(r => <RowComponent key={r.id} row={r}/>)}</>}
                </TableBody>
            </Table>
        </div>
        <DialogFooter className="p-4 border-t">
            <Button onClick={() => executeBatchMutation.mutate()}>EXECUTAR ({itemsToProcess} ITENS)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}