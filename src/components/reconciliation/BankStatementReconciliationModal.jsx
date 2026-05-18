import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { Check, FileUp, Loader2, Search, AlertCircle, EyeOff, Undo2 } from 'lucide-react';
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

const normalizeToLetters = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const toCents = (value) => Math.round(Math.abs(Number(value) || 0) * 100);
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

function matchesBankAmount(record, bankAmount) {
  const bankCents = toCents(bankAmount);
  return [record.amount, record.net_amount].filter(v => v !== undefined && v !== null).some(v => toCents(v) === bankCents);
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
  let headerIndex = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCsvLine(lines[i], delimiter).map(normalizeToLetters);
    if (cols.some(c => c.includes('data') || c.includes('date'))) { headerIndex = i; break; }
  }
  const rawHeaders = splitCsvLine(lines[headerIndex], delimiter);
  const headersLetters = rawHeaders.map(normalizeToLetters);
  const dateIndex = headersLetters.findIndex(h => h.includes('data') || h.includes('date'));
  const descriptionIndex = headersLetters.findIndex(h => h.includes('hist') || h.includes('desc') || h.includes('memo') || h.includes('lancamento'));
  let creditIndex = headersLetters.findIndex(h => h.includes('credito') || h.includes('entrada')); 
  let debitIndex = headersLetters.findIndex(h => h.includes('debito') || h.includes('saida'));
  let amountIndex = headersLetters.findIndex(h => h === 'valor' || h === 'amount' || h.includes('quantia'));
  const isBradesco = headersLetters.some(h => h.includes('docto') || h.includes('documento'));
  if (isBradesco) { creditIndex = 3; debitIndex = 4; }

  return postProcessCsv(lines.slice(headerIndex + 1).map((line, index) => {
    const columns = splitCsvLine(line, delimiter);
    if (columns.length < 3) return null;
    let amount = 0; let type = 'expense';
    if (creditIndex >= 0 && debitIndex >= 0 && creditIndex !== debitIndex && columns.length > debitIndex) {
      const creditVal = parseAmount(columns[creditIndex]); const debitVal = parseAmount(columns[debitIndex]);
      if (creditVal > 0) { amount = creditVal; type = 'income'; } else if (debitVal > 0) { amount = debitVal; type = 'expense'; } else return null;
    } else {
      const valCol = amountIndex >= 0 ? columns[amountIndex] : columns[2];
      const parsedVal = parseAmount(valCol); amount = Math.abs(parsedVal);
      if (amount === 0) return null; type = parsedVal < 0 ? 'expense' : 'income';
    }
    return { id: `csv-${index}`, date: parseStatementDate(columns[dateIndex >= 0 ? dateIndex : 0]), description: columns[descriptionIndex >= 0 ? descriptionIndex : 1] || 'Lançamento', amount, type, raw: columns };
  }).filter(Boolean).filter((row) => row.date && row.amount > 0));
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({});
  const [hideConciliated, setHideConciliated] = useState(false); // TOGGLE

  const { data: transactions = [] } = useQuery({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.list('-date', 1000), enabled: open });
  const { data: payables = [] } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500), enabled: open });
  const { data: receivables = [] } = useQuery({ queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 500), enabled: open });

  const { candidates, reconciledTransactions } = useMemo(() => {
    const reconciled = transactions.filter(t => t.reconciled === true);
    const pendTxs = transactions.filter(t => t.reconciled !== true);
    const pendPays = payables.filter(p => ['pending', 'provisioned'].includes(p.status || 'pending'));
    const pendRecs = receivables.filter(r => ['pending', 'provisioned'].includes(r.status || 'pending'));
    return { reconciledTransactions: reconciled, candidates: [...pendPays, ...pendRecs, ...pendTxs] };
  }, [payables, receivables, transactions]);

  const rows = useMemo(() => {
    return statementRows.map((row) => {
      if (ignoredRows[row.id]) return { ...row, status: 'to_ignore' };
      const processed = reconciledTransactions.find(t => matchesBankAmount(t, row.amount) && Math.abs(differenceInCalendarDays(parseISO(t.date), parseISO(row.date))) <= 4);
      if (processed) return { ...row, status: 'processed', match: processed };
      const match = manualMatches[row.id] || candidates.find(c => matchesBankAmount(c, row.amount) && Math.abs(differenceInCalendarDays(parseISO(c.date || c.due_date), parseISO(row.date))) <= 4);
      return { ...row, status: match ? 'match' : 'orphan', match };
    });
  }, [statementRows, candidates, reconciledTransactions, ignoredRows, manualMatches]);

  const itemsToProcess = rows.filter(r => r.status !== 'processed' && r.status !== 'to_ignore').length;

  const exec = useMutation({
    mutationFn: async () => {
      for (const row of rows.filter(r => r.status !== 'processed' && r.status !== 'to_ignore')) {
        if (row.status === 'orphan') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: row.type, date: row.date, reconciled: true });
        else if (row.status === 'match') {
            if (row.match.kind === 'transaction') await base44.entities.Transaction.update(row.match.id, { amount: row.amount, reconciled: true });
            else if (row.match.kind === 'payable') {
                const tx = await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'expense', date: row.date, payable_id: row.match.id, reconciled: true });
                await base44.entities.Payable.update(row.match.id, { status: 'paid', amount: row.amount, transaction_id: tx.id });
            } else if (row.match.kind === 'receivable') {
                const tx = await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'income', date: row.date, receivable_id: row.match.id, reconciled: true });
                await base44.entities.Receivable.update(row.match.id, { status: 'paid', amount: row.amount, transaction_id: tx.id });
            }
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Conciliação concluída.'); onOpenChange(false); }
  });

  const visibleRows = hideConciliated ? rows.filter(r => r.status === 'orphan') : rows;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-h-[90vh] max-w-7xl p-0">
        <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Mesa de Conciliação em Lote</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 p-6">
            <Input type="file" onChange={(e) => {
                const reader = new FileReader();
                reader.onload = (ev) => { setStatementRows(parseCsv(ev.target.result)); setManualMatches({}); setIgnoredRows({}); };
                reader.readAsText(e.target.files[0], 'ISO-8859-1');
            }} />
            <Button variant="outline" onClick={() => setHideConciliated(!hideConciliated)}>
                {hideConciliated ? "Mostrar tudo" : "Ocultar conciliados"}
            </Button>
            <Button onClick={() => exec.mutate()}>EXECUTAR CONCILIAÇÃO ({itemsToProcess})</Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead>
                        <TableHead>Correspondência</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visibleRows.map(row => (
                        <TableRow key={row.id}>
                            <TableCell>{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>{row.description}</TableCell>
                            <TableCell>{formatCurrency(row.amount)}</TableCell>
                            <TableCell>{row.match?.description || '---'}</TableCell>
                            <TableCell>
                                <Badge>{row.status}</Badge>
                            </TableCell>
                            <TableCell className="flex gap-2">
                                <Button variant="ghost" onClick={() => setIgnoredRows({...ignoredRows, [row.id]: !ignoredRows[row.id]})}>
                                    {ignoredRows[row.id] ? <Undo2 /> : <EyeOff />}
                                </Button>
                                {row.status === 'orphan' && (
                                    <Popover>
                                        <PopoverTrigger><Search /></PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0">
                                            <Command>
                                                <CommandInput />
                                                <CommandList className="max-h-[300px] overflow-y-auto">
                                                    <CommandGroup>
                                                        {candidates.map(c => (
                                                            <CommandItem key={c.id} onSelect={() => setManualMatches({...manualMatches, [row.id]: c})}>
                                                                {c.description}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}