import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { Check, FileUp, Link2, Loader2, Plus, Search, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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

const DATE_HEADERS = ['data', 'date', 'dt', 'data movimento', 'data_movimento'];
const DESCRIPTION_HEADERS = ['descrição', 'descricao', 'description', 'histórico', 'historico', 'memo', 'lançamento', 'lancamento'];
const AMOUNT_HEADERS = ['valor', 'amount', 'quantia', 'montante', 'valor lançamento', 'valor_lancamento'];
const TYPE_HEADERS = ['tipo', 'movimentação', 'movimentacao', 'type', 'entrada/saída', 'entrada_saida'];

const normalize = (value) => String(value || '').trim().toLowerCase();
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

function findHeaderIndex(headers, options) {
  return headers.findIndex((header) => options.includes(normalize(header)));
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
  if (['entrada', 'credito', 'crédito', 'credit', 'income', 'receita'].some((term) => text.includes(term))) return 'income';
  if (['saida', 'saída', 'debito', 'débito', 'debit', 'expense', 'despesa'].some((term) => text.includes(term))) return 'expense';
  return Number(amount) < 0 ? 'expense' : 'income';
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter);
  const dateIndex = findHeaderIndex(headers, DATE_HEADERS);
  const descriptionIndex = findHeaderIndex(headers, DESCRIPTION_HEADERS);
  const amountIndex = findHeaderIndex(headers, AMOUNT_HEADERS);
  const typeIndex = findHeaderIndex(headers, TYPE_HEADERS);

  return lines.slice(1).map((line, index) => {
    const columns = splitCsvLine(line, delimiter);
    const amount = parseAmount(columns[amountIndex >= 0 ? amountIndex : 2]);
    const type = resolveMovementType(columns[typeIndex], amount);

    return {
      id: `csv-${index}`,
      date: parseStatementDate(columns[dateIndex >= 0 ? dateIndex : 0]),
      description: columns[descriptionIndex >= 0 ? descriptionIndex : 1] || 'Lançamento do extrato',
      amount: Math.abs(amount),
      type,
      raw: columns,
    };
  }).filter((row) => row.date && row.amount > 0);
}

function candidateDate(candidate) {
  return candidate.kind === 'payable' ? candidate.due_date : candidate.date;
}

function candidateType(candidate) {
  return candidate.kind === 'payable' ? 'expense' : candidate.type;
}

function isDateNear(statementDate, targetDate) {
  if (!statementDate || !targetDate) return false;
  return Math.abs(differenceInCalendarDays(parseISO(statementDate), parseISO(targetDate))) <= 2;
}

function buildCandidateLabel(candidate) {
  const date = candidateDate(candidate);
  const typeLabel = candidate.kind === 'payable' ? 'Conta a pagar' : 'Transação';
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

    return {
      ...row,
      match: manualMatch || automaticMatch || null,
      matchSource: manualMatch ? 'manual' : automaticMatch ? 'auto' : null,
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
          source: 'manual',
          reconciled: true,
          notes: 'Criado a partir da conciliação de extrato bancário',
        });
        return row.id;
      }

      if (row.match.kind === 'transaction') {
        await base44.entities.Transaction.update(row.match.id, {
          amount: row.amount,
          date: row.date,
          reconciled: true,
          notes: row.match.notes || 'Conciliado com extrato bancário',
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
        notes: 'Criado a partir da conciliação de extrato bancário',
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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
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
    reader.readAsText(file, 'UTF-8');
  };

  const confirmAllAutomatic = async () => {
    const rows = rowsWithMatches.filter((row) => row.matchSource === 'auto' && !confirmedRows[row.id]);
    for (const row of rows) await reconcileMutation.mutateAsync(row);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-7xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileUp className="h-5 w-5" />
            Conciliação de Extrato Bancário
          </DialogTitle>
          <DialogDescription>
            Importe um CSV para cruzar automaticamente o extrato com transações e contas pendentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <Input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="max-w-md bg-background" />
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <Button
              onClick={confirmAllAutomatic}
              disabled={automaticMatchesCount === 0 || reconcileMutation.isPending}
              className="w-full md:w-auto"
            >
              {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar Todos os Matches Automáticos ({automaticMatchesCount})
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead colSpan={4} className="border-r text-center">Visão da Esquerda: Extrato CSV</TableHead>
                  <TableHead colSpan={3} className="text-center">Visão da Direita: Match no Sistema</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="border-r text-right">Valor</TableHead>
                  <TableHead>Correspondência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Selecione um arquivo CSV para visualizar e conciliar o extrato.
                    </TableCell>
                  </TableRow>
                ) : rowsWithMatches.map((row) => (
                  <TableRow key={row.id} className={confirmedRows[row.id] ? 'bg-green-50/60' : ''}>
                    <TableCell className="whitespace-nowrap">{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-medium">{row.description}</TableCell>
                    <TableCell>
                      <Badge variant={row.type === 'income' ? 'default' : 'secondary'}>
                        {row.type === 'income' ? 'Entrada' : 'Saída'}
                      </Badge>
                    </TableCell>
                    <TableCell className="border-r text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="max-w-[360px]">
                      {row.match ? (
                        <div className="space-y-1">
                          <p className="truncate text-sm font-medium">{row.match.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.match.kind === 'payable' ? 'Conta a pagar' : 'Transação'} • {formatCurrency(row.match.amount)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Nenhum match automático</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {confirmedRows[row.id] ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Conciliado</Badge>
                      ) : row.matchSource === 'auto' ? (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Match automático</Badge>
                      ) : row.matchSource === 'manual' ? (
                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Vínculo manual</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!confirmedRows[row.id] && row.match && (
                          <Button size="sm" onClick={() => reconcileMutation.mutate(row)} disabled={reconcileMutation.isPending}>
                            <Check className="h-4 w-4" />
                            Confirmar Conciliação
                          </Button>
                        )}

                        {!confirmedRows[row.id] && !row.match && (
                          <Button size="sm" variant="secondary" onClick={() => reconcileMutation.mutate(row)} disabled={reconcileMutation.isPending}>
                            <Plus className="h-4 w-4" />
                            Criar Novo Lançamento
                          </Button>
                        )}

                        {!confirmedRows[row.id] && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Link2 className="h-4 w-4" />
                                Vincular Manualmente
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-[420px] p-0">
                              <Command>
                                <div className="flex items-center border-b px-3">
                                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                  <CommandInput placeholder="Buscar por descrição ou valor..." />
                                </div>
                                <CommandList>
                                  <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                                  <CommandGroup heading="Pendentes para conciliação">
                                    {candidates.map((candidate) => (
                                      <CommandItem
                                        key={`${candidate.kind}-${candidate.id}`}
                                        value={buildCandidateLabel(candidate)}
                                        onSelect={() => setManualMatches((previous) => ({ ...previous, [row.id]: candidate }))}
                                        className="cursor-pointer"
                                      >
                                        <div className="flex w-full items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{candidate.description}</p>
                                            <p className="text-xs text-muted-foreground">{candidate.kind === 'payable' ? 'Conta a pagar' : 'Transação'}</p>
                                          </div>
                                          <span className="shrink-0 text-sm font-semibold">{formatCurrency(candidate.amount)}</span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}

                        {confirmedRows[row.id] && <XCircle className="h-5 w-5 text-green-600" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleClose(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}