import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays, addMonths } from 'date-fns';
import { Check, FileUp, Loader2, Search, EyeOff, Undo2, Eye, PlusCircle, Pencil, AlertTriangle, RefreshCcw } from 'lucide-react';
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

function getRecordAccountId(record) {
  return record?.account_id || record?.origin_id || '';
}

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({}); // Agora guarda arrays: { [rowId]: [candidate1, candidate2] }
  const [hideProcessed, setHideProcessed] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [editingOrphan, setEditingOrphan] = useState(null);
  
  // Novos Estados (Motor e Segurança)
  const [recurrenceType, setRecurrenceType] = useState('single');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showOtherAccounts, setShowOtherAccounts] = useState(false);

  // Queries
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingAccounts(true);
      base44.entities.Account.list('', 500)
        .then(res => {
          setAccounts(Array.isArray(res) ? res : []);
          setLoadingAccounts(false);
        })
        .catch(err => {
          console.error("Erro ao carregar contas:", err);
          setAccounts([]);
          setLoadingAccounts(false);
        });
    }
  }, [open]);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('', 500),
    enabled: open,
  });

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

  const visibleAccounts = useMemo(() => {
    console.log("Accounts query data:", accounts);
    return Array.isArray(accounts) ? accounts.filter((account) => account.active !== false) : [];
  }, [accounts]);

  const { candidates, reconciledTransactions } = useMemo(() => {
    if (!selectedAccountId) return { reconciledTransactions: [], candidates: [] };

    const isOwner = (item) => getRecordAccountId(item) === selectedAccountId;

    const reconciled = transactions
      .filter(t => t.status === 'conciliated' && (isOwner(t) || showOtherAccounts))
      .map(t => ({ ...t, kind: 'transaction' }));
      
    const pendingTransactions = transactions
      .filter(t => t.status !== 'conciliated' && (isOwner(t) || showOtherAccounts))
      .map(t => ({ ...t, kind: 'transaction' }));
      
    const pendingPayables = payables
      .filter(p => ['pending', 'provisioned'].includes(p.status || 'pending') && (isOwner(p) || showOtherAccounts))
      .map(p => ({ ...p, kind: 'payable' }));
      
    const pendingReceivables = receivables
      .filter(r => ['pending', 'provisioned'].includes(r.status || 'pending') && (isOwner(r) || showOtherAccounts))
      .map(r => ({ ...r, kind: 'receivable' }));

    return { 
      reconciledTransactions: reconciled, 
      candidates: [...pendingPayables, ...pendingReceivables, ...pendingTransactions] 
    };
  }, [payables, receivables, transactions, selectedAccountId, showOtherAccounts]);

  const toggleCandidate = (row, candidate) => {
    setManualMatches(prev => {
      const current = prev[row.id] !== undefined ? prev[row.id] : (row.selected || []);
      const exists = current.find(c => c.id === candidate.id);
      if (exists) {
        return { ...prev, [row.id]: current.filter(c => c.id !== candidate.id) };
      } else {
        return { ...prev, [row.id]: [...current, candidate] };
      }
    });
  };

  const rowsWithState = useMemo(() => {
    if (!selectedAccountId) return [];
    
    const poolReconciled = [...reconciledTransactions];
    const poolCandidates = [...candidates];

    return statementRows.map((row) => {
      if (ignoredRows[row.id]) return { ...row, status: 'to_ignore' };

      // Identifica se já foi processado antes (match exato com transação já reconciliada)
      const processedIdx = poolReconciled.findIndex(t => getRecordAccountId(t) === selectedAccountId && matchesBankAmount(t, row.amount) && isDateNear(t.date, row.date));
      if (processedIdx !== -1) {
        const match = poolReconciled[processedIdx];
        poolReconciled.splice(processedIdx, 1); 
        return { ...row, status: 'processed', match };
      }

      if (row.isDraftResolved) return { ...row, status: 'draft_ready' };

      // Se o usuário interagiu manualmente (adicionou ou removeu matches)
      if (manualMatches[row.id] !== undefined) {
        const selected = manualMatches[row.id];
        if (selected.length > 0) {
          const sum = selected.reduce((acc, c) => acc + (c.amount || 0), 0);
          const isReady = toCents(sum) === toCents(row.amount);
          return { ...row, status: isReady ? 'manual_match_ready' : 'manual_match_pending', selected, sum };
        }
        return { ...row, status: 'orphan' };
      }

      // Tenta Auto-Match para contas pendentes
      const validCandidates = poolCandidates.filter(c => {
        const cType = c.kind === 'transaction' ? c.type : (c.kind === 'receivable' ? 'receivable' : 'payable');
        const isCorrectType = row.type === 'income' 
          ? ['receivable', 'income', 'transfer'].includes(cType)
          : ['payable', 'expense', 'transfer'].includes(cType);
          
        return isCorrectType && matchesBankAmount(c, row.amount);
      });

      let autoMatchIdx = -1;
      if (validCandidates.length === 1) {
        // Apenas um candidato com valor exato (valor é um sinal forte)
        autoMatchIdx = poolCandidates.findIndex(c => c.id === validCandidates[0].id);
      } else if (validCandidates.length > 1) {
        // Mais de um com mesmo valor, escolhe o de data mais próxima (limite 45 dias)
        let closest = null;
        let minDiff = Infinity;
        validCandidates.forEach(c => {
           const cDate = candidateDate(c);
           if (!cDate || !row.date) return;
           const diff = Math.abs(differenceInCalendarDays(parseISO(String(cDate).substring(0, 10)), parseISO(String(row.date).substring(0, 10))));
           if (diff < minDiff) {
             minDiff = diff;
             closest = c;
           }
        });
        if (closest && minDiff <= 45) {
           autoMatchIdx = poolCandidates.findIndex(c => c.id === closest.id);
        }
      }

      if (autoMatchIdx !== -1) {
         const match = poolCandidates[autoMatchIdx];
         poolCandidates.splice(autoMatchIdx, 1); // Consome para não duplicar
         return { ...row, status: 'manual_match_ready', selected: [match], sum: match.amount, isAutoMatch: true };
      }

      return { ...row, status: 'orphan' };
    });
  }, [statementRows, candidates, reconciledTransactions, ignoredRows, manualMatches, selectedAccountId]);

  const itemsToProcess = rowsWithState.filter(r => 
    ['manual_match_ready', 'draft_ready', 'to_ignore'].includes(r.status)
  ).length;

  const handleReclassify = async (match) => {
    if (window.confirm("Este lançamento pertence a outra conta. Mover para a conta atual selecionada?")) {
      try {
        if (match.kind === 'transaction') {
          await base44.entities.Transaction.update(match.id, { account_id: selectedAccountId });
        } else if (match.kind === 'payable') {
          await base44.entities.Payable.update(match.id, { account_id: selectedAccountId, origin_id: selectedAccountId, origin_type: 'account' });
        } else if (match.kind === 'receivable') {
          await base44.entities.Receivable.update(match.id, { account_id: selectedAccountId });
        }
        queryClient.invalidateQueries();
        toast.success("Lançamento reclassificado. Atualizando mesa...");
      } catch (e) {
        toast.error("Erro ao reclassificar.");
      }
    }
  };

  const executeBatchMutation = useMutation({
    mutationFn: async () => {
      const toProcess = rowsWithState.filter(r => 
        ['manual_match_ready', 'draft_ready', 'to_ignore'].includes(r.status)
      );

      for (const row of toProcess) {
        if (row.status === 'to_ignore') {
          await base44.entities.Transaction.create({
            description: row.description,
            amount: row.amount,
            type: 'ignored',
            category: 'ignored',
            date: row.date,
            source: 'manual',
            reconciled: false,
            status: 'ignored',
            notes: 'Ignorado via conciliação em lote',
            account_id: selectedAccountId,
          });
        } 
        else if (row.status === 'draft_ready') {
          // Apenas cria a transação real. Payables e Receivables não entram mais no fluxo real via conciliação.
          await base44.entities.Transaction.create({
            description: row.description,
            amount: row.amount,
            type: row.type,
            category: row.preSelectedCategory || undefined,
            date: row.date,
            source: 'manual',
            reconciled: true,
            status: 'conciliated',
            notes: 'Criado e Categorizado na Conciliação',
            account_id: selectedAccountId,
          });
        } 
        else if (row.status === 'manual_match_ready') {
          // Para cada item selecionado que compõe o valor do extrato, criamos/atualizamos a transação real.
          for (const match of row.selected) {
            if (match.kind === 'transaction') {
              await base44.entities.Transaction.update(match.id, {
                reconciled: true,
                status: 'conciliated',
                account_id: selectedAccountId,
                notes: match.notes ? match.notes + ' | Conciliado com extrato' : 'Conciliado com extrato',
              });
            } else if (match.kind === 'payable') {
              const transaction = await base44.entities.Transaction.create({
                description: match.description,
                amount: match.amount,
                type: 'expense', 
                category: match.category,
                date: row.date,
                source: 'manual',
                payable_id: match.id,
                reconciled: true,
                status: 'conciliated',
                account_id: selectedAccountId,
                notes: 'Pagamento conciliado na mesa',
              });
              await base44.entities.Payable.update(match.id, {
                status: match.origin_type === 'card' ? 'conciliated' : 'paid',
                transaction_id: transaction.id,
              });
            } else if (match.kind === 'receivable') {
              const transaction = await base44.entities.Transaction.create({
                description: match.description,
                amount: match.amount,
                net_amount: match.amount,
                type: 'income', 
                category: match.category,
                date: row.date,
                source: 'manual',
                receivable_id: match.id,
                reconciled: true,
                status: 'conciliated',
                account_id: selectedAccountId,
                notes: 'Recebimento conciliado na mesa',
              });
              await base44.entities.Receivable.update(match.id, {
                status: 'received',
                transaction_id: transaction.id,
              });
            }
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
      setEditingOrphan(null);
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

  const handleSaveDraft = (e) => {
    e.preventDefault();
    if (!editingOrphan) return;

    const formData = new FormData(e.currentTarget);
    const category = String(formData.get('category') || '');
    const description = String(formData.get('description') || '');
    const installments = Number(formData.get('installments')) || 1;
    const currentInst = Number(formData.get('currentInstallment')) || 1;

    setStatementRows(prev => prev.map(r => 
      r.id === editingOrphan.id 
        ? { 
            ...r, 
            description, 
            preSelectedCategory: category, 
            recurrence: recurrenceType,
            installmentsCount: installments,
            currentInstallment: currentInst,
            isDraftResolved: true 
          } 
        : r
    ));
    setEditingOrphan(null);
  };

  const isLoading = loadingTransactions || loadingPayables || loadingReceivables || loadingAccounts || parsingPdf;
  
  const displayRows = hideProcessed ? rowsWithState.filter(r => r.status !== 'processed') : rowsWithState;
  
  const incomeRows = displayRows.filter(r => r.type === 'income').sort((a, b) => a.date.localeCompare(b.date));
  const expenseRows = displayRows.filter(r => r.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));

  const renderRow = (row, index) => {
    const isProcessed = row.status === 'processed';
    const isIgnored = row.status === 'to_ignore';
    const isForeign = row.status === 'foreign_match';
    
    let badgeClass = "bg-slate-100 text-slate-500";
    if (row.status === 'manual_match_ready') badgeClass = "bg-green-100 text-green-700";
    if (row.status === 'manual_match_pending') badgeClass = "bg-amber-100 text-amber-700";
    if (row.status === 'orphan') badgeClass = "bg-red-100 text-red-700";
    if (row.status === 'draft_ready') badgeClass = "bg-blue-100 text-blue-700";
    
    return (
      <TableRow key={row.id} className={`${isProcessed || isIgnored ? 'bg-slate-50/50 opacity-50 grayscale' : 'hover:bg-slate-50'} transition-all`}>
        <TableCell className="w-10 text-center font-bold text-slate-400 text-xs">{index + 1}</TableCell>
        <TableCell className="whitespace-nowrap font-bold text-slate-600 text-xs">{format(parseISO(row.date), 'dd/MM/yyyy')}</TableCell>
        <TableCell className="max-w-[450px] truncate font-bold text-slate-800 text-sm">
          {row.description}
          {row.status === 'draft_ready' && row.recurrence === 'installment' && <span className="ml-2 text-[10px] text-blue-500">({row.installmentsCount} parcelas)</span>}
          {row.status === 'draft_ready' && row.recurrence === 'fixed' && <span className="ml-2 text-[10px] text-blue-500">(Fixo)</span>}
        </TableCell>
        <TableCell className="border-r text-right font-black text-sm">{formatCurrency(row.amount)}</TableCell>
        <TableCell className="max-w-[500px]">
          {row.selected && row.selected.length > 0 ? (
              <div className="flex flex-col gap-1">
                {row.selected.map(s => (
                  <p key={s.id} className="truncate text-xs font-bold text-slate-700">✓ {s.description} ({formatCurrency(s.amount)})</p>
                ))}
                {row.status === 'manual_match_pending' && (
                  <p className="text-xs text-amber-600 font-bold mt-1">Faltam: {formatCurrency(Math.abs(row.amount - row.sum))}</p>
                )}
              </div>
          ) : row.match ? (
              <p className="truncate text-sm font-bold text-slate-500">{row.match.description}</p>
          ) : (
              <span className="text-[11px] font-bold text-slate-400 uppercase">
                {row.status === 'draft_ready' ? `Novo: ${row.preSelectedCategory}` : 'Nenhum selecionado'}
              </span>
          )}
        </TableCell>
        <TableCell>
          <Badge className={`${badgeClass} border-none font-bold uppercase text-[9px]`}>
              {row.status === 'processed' ? 'Já Salvo' : 
               row.status === 'manual_match_ready' ? 'Pronto p/ Conciliar' :
               row.status === 'manual_match_pending' ? 'Divergente (Soma !=)' :
               row.status === 'draft_ready' ? 'Criar Avulso' :
               row.status === 'to_ignore' ? 'Ignorado' : 'Órfão'}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleIgnore(row.id)}>
                  {row.status === 'to_ignore' ? <Undo2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>

              {(row.status === 'orphan' || row.status === 'draft_ready' || row.status.startsWith('manual_match')) && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditingOrphan(row); setRecurrenceType(row.recurrence || 'single'); }} className="text-blue-600 hover:text-blue-700" title="Criar lançamento avulso para cobrir diferença">
                        {row.status === 'draft_ready' ? <Pencil className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button size="sm" variant="outline"><Search className="h-4 w-4" /></Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="end">
                            <Command>
                                <CommandInput placeholder="Buscar lançamentos para compor..." />
                                <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandGroup>
                                        {candidates.filter(c => {
                                            const cType = c.kind === 'transaction' ? c.type : (c.kind === 'receivable' ? 'receivable' : 'payable');
                                            if (row.type === 'income') {
                                                return ['receivable', 'income', 'transfer'].includes(cType);
                                            } else {
                                                return ['payable', 'expense', 'transfer'].includes(cType);
                                            }
                                        }).map(c => {
                                            const isSelected = (row.selected || []).find(s => s.id === c.id);
                                            return (
                                              <CommandItem key={c.id} onSelect={() => toggleCandidate(row, c)}>
                                                  <div className="flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-slate-300'}`}>
                                                      {isSelected && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className="truncate flex-1">{c.description}</span>
                                                    <span className="font-bold">{formatCurrency(c.amount)}</span>
                                                  </div>
                                              </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                  </>
              )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
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
              
              {/* HEADER DE CONTROLES: Conta, Arquivo e Executar */}
              <div className="flex flex-col gap-4 rounded-xl border bg-white p-4 xl:flex-row xl:items-center xl:justify-between shadow-sm sticky top-0 z-10">
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <select 
                    className="flex h-10 rounded-md border border-input bg-slate-50 px-3 py-2 text-sm font-bold min-w-[200px]"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                  >
                    <option value="">1. Selecione a Conta...</option>
                    {visibleAccounts.length === 0 && (
                      <option value="" disabled>Nenhuma conta encontrada</option>
                    )}
                    {visibleAccounts.map(a => {
                      const accountName = a.name || a.data?.name || a.bank || a.data?.bank || 'Conta sem nome';
                      return (
                        <option key={a.id} value={a.id}>{accountName}</option>
                      );
                    })}
                  </select>

                  <Input disabled={!selectedAccountId || parsingPdf || isLoading} ref={fileInputRef} type="file" accept=".csv,text/csv,application/pdf,.pdf" onChange={handleFileChange} className="max-w-md w-full sm:w-auto bg-slate-50 cursor-pointer font-bold" />
                  
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                  {parsingPdf && <span className="text-xs font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap shrink-0">Processando PDF...</span>}
                  
                  {/* Removido Buscar em Outras Contas (Sem automatização) */}
                  
                  <Button variant="outline" onClick={() => setHideProcessed(!hideProcessed)}>
                      {hideProcessed ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                      {hideProcessed ? "Mostrar Processados" : "Ocultar Processados"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => executeBatchMutation.mutate()}
                    disabled={itemsToProcess === 0 || executeBatchMutation.isPending || !selectedAccountId}
                    className="w-full md:w-auto font-bold bg-primary px-8"
                  >
                    {executeBatchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    EXECUTAR CONCILIAÇÃO ({itemsToProcess} ITENS)
                  </Button>
                </div>
              </div>

              {!selectedAccountId && statementRows.length > 0 && (
                <div className="flex items-center justify-center p-12 text-slate-400 border rounded-xl bg-white border-dashed">
                  <AlertTriangle className="mr-2" /> Selecione a conta bancária no topo para liberar a auditoria.
                </div>
              )}

              {selectedAccountId && (
                <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-100/80">
                        <TableHead colSpan={4} className="border-r text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                          VISÃO DO EXTRATO BANCÁRIO (CSV/PDF)
                        </TableHead>
                        <TableHead colSpan={3} className="text-center font-black uppercase text-[10px] tracking-widest text-slate-500">
                          DIAGNÓSTICO E REVISÃO
                        </TableHead>
                      </TableRow>
                      <TableRow className="text-[11px] uppercase tracking-wider font-bold">
                        <TableHead className="w-10 text-center">#</TableHead>
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
                          <TableCell colSpan={7} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                            Nenhum arquivo processado
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {incomeRows.length > 0 && (
                            <>
                              <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
                                <TableCell colSpan={7} className="text-center font-black uppercase text-[11px] tracking-widest text-slate-600 py-3">
                                  Entradas / Receitas
                                </TableCell>
                              </TableRow>
                              {incomeRows.map((row, i) => renderRow(row, i))}
                            </>
                          )}
                          
                          {expenseRows.length > 0 && (
                            <>
                              <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
                                <TableCell colSpan={7} className="text-center font-black uppercase text-[11px] tracking-widest text-slate-600 py-3">
                                  Saídas / Despesas
                                </TableCell>
                              </TableRow>
                              {expenseRows.map((row, i) => renderRow(row, incomeRows.length + i))}
                            </>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Criação Rápida com Categorias Nativas e Recorrência */}
      <Dialog open={!!editingOrphan} onOpenChange={(isOpen) => !isOpen && setEditingOrphan(null)}>
        <DialogContent className="sm:max-w-[425px] font-sora">
          <DialogHeader>
            <DialogTitle>Preparar Lançamento</DialogTitle>
            <DialogDescription>
              Ajuste a descrição e informe a categoria. Ele será salvo no banco ao executar a conciliação.
            </DialogDescription>
          </DialogHeader>
          {editingOrphan && (
            <form onSubmit={handleSaveDraft} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Data</label>
                  <Input disabled value={format(parseISO(editingOrphan.date), 'dd/MM/yyyy')} className="bg-slate-50 font-medium" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Valor</label>
                  <Input disabled value={formatCurrency(editingOrphan.amount)} className="bg-slate-50 font-black text-right" />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Descrição Final</label>
                <Input name="description" defaultValue={editingOrphan.description} autoFocus className="font-medium" required />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Categoria</label>
                <select 
                  name="category" 
                  defaultValue={editingOrphan.preSelectedCategory || ''} 
                  className="flex h-10 w-full rounded-md border border-input bg-slate-50 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-medium" 
                  required
                >
                  <option value="" disabled>Selecione uma categoria...</option>
                  {dbCategories
                    .filter(c => c.active !== false && c.type === editingOrphan.type)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(cat => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Lançamento</label>
                <select 
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-slate-50 px-3 py-2 text-sm font-medium" 
                >
                  <option value="single">Avulso (Apenas este mês)</option>
                  <option value="fixed">Fixo (Repete todo mês)</option>
                  <option value="installment">Parcelado (Fixo com fim)</option>
                </select>
              </div>

              {recurrenceType === 'installment' && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Parcela Atual</label>
                    <Input type="number" name="currentInstallment" defaultValue={editingOrphan.currentInstallment || 1} min="1" className="font-medium" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Total</label>
                    <Input type="number" name="installments" defaultValue={editingOrphan.installmentsCount || 2} min="2" className="font-medium" required />
                  </div>
                </div>
              )}

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingOrphan(null)}>Cancelar</Button>
                <Button type="submit" className="bg-primary font-bold">Salvar e Preparar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}