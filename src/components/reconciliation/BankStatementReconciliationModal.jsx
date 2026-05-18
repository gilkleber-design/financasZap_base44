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

// ... [Funções de parse, normalize e utilitários permanecem exatamente como antes] ...
const normalizeToLetters = (val) => String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const toCents = (val) => Math.round(Math.abs(Number(val) || 0) * 100);
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);

function matchesBankAmount(record, bankAmount) {
  const bankCents = toCents(bankAmount);
  return [record.amount, record.net_amount].filter(v => v !== undefined && v !== null).some(v => toCents(v) === bankCents);
}

function splitCsvLine(line, delimiter) {
  const result = []; let current = ''; let insideQuotes = false;
  for (const char of line) { if (char === '"') insideQuotes = !insideQuotes; else if (char === delimiter && !insideQuotes) { result.push(current.trim().replace(/^"|"$/g, '')); current = ''; } else current += char; }
  result.push(current.trim().replace(/^"|"$/g, '')); return result;
}

function parseAmount(raw) {
  const clean = String(raw || '').replace(/\s/g, '').replace(/R\$/gi, '');
  const isNeg = clean.includes('-') || /^\(.*\)$/.test(clean);
  const norm = clean.replace(/[()]/g, '').replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const val = Number.parseFloat(norm) || 0; return isNeg ? -val : val;
}

function parseStatementDate(raw) {
  const val = String(raw || '').trim();
  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
  for (const p of formats) { const parsed = parse(val, p, new Date()); if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd'); }
  const iso = parseISO(val); return isValid(iso) ? format(iso, 'yyyy-MM-dd') : '';
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (splitCsvLine(lines[i], delimiter).map(normalizeToLetters).some(c => c.includes('data'))) { headerIdx = i; break; }
  }
  const headers = splitCsvLine(lines[headerIdx], delimiter).map(normalizeToLetters);
  const dateIdx = headers.findIndex(h => h.includes('data'));
  const descIdx = headers.findIndex(h => h.includes('hist') || h.includes('desc'));
  let credIdx = headers.findIndex(h => h.includes('credito')); 
  let debIdx = headers.findIndex(h => h.includes('debito'));
  if (headers.some(h => h.includes('docto'))) { credIdx = 3; debIdx = 4; }
  
  return lines.slice(headerIdx + 1).map((line, i) => {
    const cols = splitCsvLine(line, delimiter);
    const amount = parseAmount(cols[credIdx]) || parseAmount(cols[debIdx]);
    const dateStr = parseStatementDate(cols[dateIdx]);
    if (!dateStr || !isValid(parseISO(dateStr))) return null;
    return { id: `csv-${i}`, date: dateStr, description: cols[descIdx] || 'Lançamento', amount: Math.abs(amount), type: parseAmount(cols[credIdx]) > 0 ? 'income' : 'expense' };
  }).filter(Boolean);
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({});
  const [hideProcessed, setHideProcessed] = useState(false);

  const { data: txs = [] } = useQuery({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.list('-date', 1000), enabled: open });
  const { data: pays = [] } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500), enabled: open });
  const { data: recs = [] } = useQuery({ queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 500), enabled: open });

  const candidates = useMemo(() => [
      ...pays.filter(p => p.status === 'pending').map(p => ({ ...p, kind: 'payable' })),
      ...recs.filter(r => r.status === 'pending').map(r => ({ ...r, kind: 'receivable' })),
      ...txs.filter(t => !t.reconciled).map(t => ({ ...t, kind: 'transaction' }))
  ], [pays, recs, txs]);

  const rowsWithState = useMemo(() => {
      const reconciledTxs = txs.filter(t => t.reconciled);
      return statementRows.map(row => {
          if (ignoredRows[row.id]) return { ...row, status: 'ignored' };
          const processed = reconciledTxs.find(t => matchesBankAmount(t, row.amount) && Math.abs(differenceInCalendarDays(parseISO(t.date), parseISO(row.date))) <= 4);
          if (processed) return { ...row, status: 'processed', match: processed };
          const match = manualMatches[row.id] || candidates.find(c => matchesBankAmount(c, row.amount) && Math.abs(differenceInCalendarDays(parseISO(c.date || c.due_date), parseISO(row.date))) <= 4);
          return { ...row, status: match ? (manualMatches[row.id] ? 'manual_match' : 'auto_match') : 'orphan', match };
      });
  }, [statementRows, candidates, ignoredRows, manualMatches, txs]);

  // Lógica do Toggle: "Ocultar conciliados" deixa APENAS o 'orphan' visível
  const visibleRows = useMemo(() => hideProcessed ? rowsWithState.filter(r => r.status === 'orphan') : rowsWithState, [rowsWithState, hideProcessed]);

  const exec = useMutation({
    mutationFn: async () => {
      for (const row of rowsWithState.filter(r => r.status !== 'processed' && r.status !== 'ignored')) {
        if (row.status === 'orphan') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: row.type, date: row.date, reconciled: true });
        else if (row.status.includes('match')) {
            if (row.match.kind === 'transaction') await base44.entities.Transaction.update(row.match.id, { amount: row.amount, reconciled: true, type: row.type });
            else if (row.match.kind === 'payable') { 
                const tx = await base44.entities.Transaction.create({ description: row.description || row.match.description, amount: row.amount, type: 'expense', date: row.date, payable_id: row.match.id, reconciled: true });
                await base44.entities.Payable.update(row.match.id, { status: 'paid', amount: row.amount, transaction_id: tx.id });
            } else if (row.match.kind === 'receivable') {
                const tx = await base44.entities.Transaction.create({ description: row.description || row.match.description, amount: row.match.amount || row.amount, net_amount: row.amount, type: 'income', date: row.date, receivable_id: row.match.id, reconciled: true });
                await base44.entities.Receivable.update(row.match.id, { net_amount: row.amount, status: 'received', transaction_id: tx.id });
            }
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Auditoria concluída!'); onOpenChange(false); }
  });

  const handleFileChange = (e) => {
      const reader = new FileReader();
      reader.onload = (ev) => { setStatementRows(parseCsv(ev.target.result)); setManualMatches({}); setIgnoredRows({}); };
      reader.readAsText(e.target.files[0], 'ISO-8859-1');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-h-[90vh] max-w-7xl p-0 font-sora">
        <DialogHeader className="border-b px-6 py-5 bg-slate-50 shrink-0">
          <DialogTitle>Mesa de Conciliação em Lote</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 p-4">
            <Input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <Button variant="outline" onClick={() => setHideProcessed(!hideProcessed)}>
                {hideProcessed ? "Mostrar tudo" : "Ocultar conciliados"}
            </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Valor</TableHead>
                        <TableHead>Match</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead>
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
                                <Badge variant="secondary">
                                    {row.status === 'processed' ? 'Conciliado - WhatsApp' : 
                                     row.status === 'auto_match' || row.status === 'manual_match' ? 'Conciliado - Match' :
                                     row.status === 'ignored' ? 'Ignorado' : 'Órfão'}
                                </Badge>
                            </TableCell>
                            <TableCell className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setIgnoredRows({...ignoredRows, [row.id]: !ignoredRows[row.id]})}>
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
                                                                {c.description} - {formatCurrency(c.amount)}
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
        <DialogFooter className="p-4 border-t">
            <Button onClick={() => exec.mutate()}>EXECUTAR CONCILIAÇÃO</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}