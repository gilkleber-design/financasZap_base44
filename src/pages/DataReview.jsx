import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ReviewFilters from '@/components/data-review/ReviewFilters';
import ReviewTable from '@/components/data-review/ReviewTable';

const CONFIG = {
  payables: {
    title: 'Todos os Payables',
    queryKey: ['data-review-payables'],
    queryFn: () => base44.entities.Payable.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor' },
      { key: 'status', label: 'Status' },
      { key: 'due_date', label: 'Vencimento' },
      { key: 'category', label: 'Categoria' },
      { key: 'origin_type', label: 'Origem' },
      { key: 'recurrence_id', label: 'Recorrência' },
      { key: 'created_date', label: 'Criado em' },
    ],
  },
  receivables: {
    title: 'Todos os Receivables',
    queryKey: ['data-review-receivables'],
    queryFn: () => base44.entities.Receivable.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor Bruto' },
      { key: 'net_amount', label: 'Valor Líquido' },
      { key: 'status', label: 'Status' },
      { key: 'due_date', label: 'Recebimento' },
      { key: 'income_source_id', label: 'Origem' },
      { key: 'account_id', label: 'Conta' },
      { key: 'created_date', label: 'Criado em' },
    ],
  },
  transactions: {
    title: 'Todas as Transactions',
    queryKey: ['data-review-transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 1000),
    columns: [
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor Bruto' },
      { key: 'net_amount', label: 'Valor Líquido' },
      { key: 'type', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Data' },
      { key: 'category', label: 'Categoria' },
      { key: 'account_id', label: 'Origem Conta' },
      { key: 'card_id', label: 'Origem Cartão' },
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

export default function DataReview() {
  const [activeType, setActiveType] = useState('payables');
  const [search, setSearch] = useState('');

  const currentConfig = CONFIG[activeType];

  const { data = [], isLoading } = useQuery({
    queryKey: currentConfig.queryKey,
    queryFn: currentConfig.queryFn,
    initialData: [],
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data;

    return data.filter((row) =>
      Object.values(row || {}).some((value) =>
        String(value ?? '').toLowerCase().includes(term)
      )
    );
  }, [data, search]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredRows]);

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
        />
      )}
    </div>
  );
}