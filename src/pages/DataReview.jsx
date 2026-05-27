import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReviewFilters from '@/components/data-review/ReviewFilters';
import ReviewTable from '@/components/data-review/ReviewTable';
import { useCategories } from '@/hooks/useCategories';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';
import { normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const CONFIG = {
  payables: {
    title: 'Todos os Payables',
    entityName: 'Payable',
    queryKey: ['data-review-payables'],
    queryFn: () => base44.entities.Payable.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor' },
      { key: 'status', label: 'Status', editable: true },
      { key: 'due_date', label: 'Vencimento' },
      { key: 'category', label: 'Categoria', editable: true },
      { key: 'origin_id', label: 'Origem', editable: true },
      { key: 'recurrence_id', label: 'Recorrência' },
      { key: 'created_date', label: 'Criado em' },
    ],
  },
  receivables: {
    title: 'Todos os Receivables',
    entityName: 'Receivable',
    queryKey: ['data-review-receivables'],
    queryFn: () => base44.entities.Receivable.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor Bruto' },
      { key: 'net_amount', label: 'Valor Líquido' },
      { key: 'status', label: 'Status', editable: true },
      { key: 'due_date', label: 'Recebimento' },
      { key: 'income_source_id', label: 'Origem', editable: true },
      { key: 'account_id', label: 'Conta', editable: true },
      { key: 'created_date', label: 'Criado em' },
    ],
  },
  transactions: {
    title: 'Todas as Transactions',
    entityName: 'Transaction',
    queryKey: ['data-review-transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor Bruto' },
      { key: 'net_amount', label: 'Valor Líquido' },
      { key: 'type', label: 'Tipo' },
      { key: 'status', label: 'Status', editable: true },
      { key: 'date', label: 'Data' },
      { key: 'category', label: 'Categoria', editable: true },
      { key: 'account_id', label: 'Origem Conta', editable: true },
      { key: 'card_id', label: 'Origem Cartão', editable: true },
      { key: 'payable_id', label: 'Payable' },
      { key: 'receivable_id', label: 'Receivable' },
      { key: 'created_date', label: 'Criado em' },
    ],
  },
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const DATE_FIELD_MAP = {
  payables: 'due_date',
  receivables: 'due_date',
  transactions: 'date',
};

const normalizeDate = (value) => String(value || '').slice(0, 10);

export default function DataReview() {
  const [activeType, setActiveType] = useState('payables');
  const [search, setSearch] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [savingCellKey, setSavingCellKey] = useState('');

  const queryClient = useQueryClient();
  const { flatForSelect } = useCategories();
  const { origins, accounts, cards } = usePaymentOrigins();
  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income-sources'],
    queryFn: () => base44.entities.IncomeSource.list('name', 100),
    initialData: [],
  });
  const currentConfig = CONFIG[activeType];

  const { data = [], isLoading } = useQuery({
    queryKey: currentConfig.queryKey,
    queryFn: currentConfig.queryFn,
    initialData: [],
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const dateField = DATE_FIELD_MAP[activeType];

    return data.filter((row) => {
      const matchesSearch = !term || Object.values(row || {}).some((value) =>
        String(value ?? '').toLowerCase().includes(term)
      );

      const rowDate = normalizeDate(row?.[dateField]);
      const matchesMonth = dateFilterMode === 'month'
        ? (!selectedMonth || rowDate.slice(0, 7) === selectedMonth)
        : true;
      const matchesStart = dateFilterMode === 'range'
        ? (!startDate || rowDate >= startDate)
        : true;
      const matchesEnd = dateFilterMode === 'range'
        ? (!endDate || rowDate <= endDate)
        : true;

      return matchesSearch && matchesMonth && matchesStart && matchesEnd;
    });
  }, [activeType, data, dateFilterMode, endDate, search, selectedMonth, startDate]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredRows]);

  const updateMutation = useMutation({
    mutationFn: async ({ row, column, value }) => {
      const entityApi = base44.entities[currentConfig.entityName];
      const payload = { [column.key]: value };

      if (activeType === 'payables' && column.key === 'origin_id') {
        const selectedOrigin = origins.find((origin) => origin.id === value);
        payload.origin_type = selectedOrigin?.type || null;
      }

      if (activeType === 'transactions' && column.key === 'account_id' && value) {
        payload.card_id = null;
      }

      if (activeType === 'transactions' && column.key === 'card_id' && value) {
        payload.account_id = null;
      }

      return entityApi.update(row.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentConfig.queryKey });
      toast.success('Lançamento atualizado.');
      setSavingCellKey('');
    },
  });

  const getColumnOptions = (column) => {
    if (column.key === 'category') {
      return flatForSelect.map((item) => ({ value: item.value, label: item.label }));
    }

    if (column.key === 'origin_id') {
      return origins.map((item) => ({ value: item.id, label: item.label }));
    }

    if (column.key === 'income_source_id') {
      return incomeSources.map((item) => ({ value: item.id, label: normalizeCategoryLabel(item.name) }));
    }

    if (column.key === 'account_id') {
      return accounts.map((item) => ({ value: item.id, label: item.name }));
    }

    if (column.key === 'card_id') {
      return cards.map((item) => ({ value: item.id, label: item.name }));
    }

    if (column.key === 'status') {
      if (activeType === 'payables') {
        return [
          { value: 'pending', label: 'Pendente' },
          { value: 'paid', label: 'Pago' },
          { value: 'provisioned', label: 'Provisionado' },
        ];
      }

      if (activeType === 'receivables') {
        return [
          { value: 'pending', label: 'Pendente' },
          { value: 'received', label: 'Recebido' },
          { value: 'overdue', label: 'Atrasado' },
        ];
      }

      return [
        { value: 'registered', label: 'Registrado' },
        { value: 'conciliated', label: 'Conciliado' },
        { value: 'diverged', label: 'Divergente' },
        { value: 'ignored', label: 'Ignorado' },
      ];
    }

    return [];
  };

  const handleCellChange = (row, column, value) => {
    setSavingCellKey(`${row.id}:${column.key}`);
    updateMutation.mutate({ row, column, value });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revisão de Dados</h1>
          <p className="text-sm text-muted-foreground">Acesso completo a Payables, Receivables e Transactions.</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total filtrado</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <ReviewFilters
        search={search}
        setSearch={setSearch}
        activeType={activeType}
        setActiveType={setActiveType}
        dateFilterMode={dateFilterMode}
        setDateFilterMode={setDateFilterMode}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          Carregando registros...
        </div>
      ) : (
        <ReviewTable
          title={currentConfig.title}
          columns={currentConfig.columns}
          rows={filteredRows}
          getColumnOptions={getColumnOptions}
          onCellChange={handleCellChange}
          savingCellKey={savingCellKey}
        />
      )}
    </div>
  );
}