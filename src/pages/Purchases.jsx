import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format, addMonths, subMonths } from 'date-fns';
import { useCategories } from '@/hooks/useCategories';
import { ShoppingBag } from 'lucide-react';
import PurchaseFilters from '@/components/purchases/PurchaseFilters';
import PurchaseList from '@/components/purchases/PurchaseList';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const normalize = (str) => String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function Purchases() {
  const [monthDate, setMonthDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');

  const { flatForSelect, getCategoryLabel } = useCategories();

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });
  const { data: payables = [], isLoading: loadingPay } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
  });

  const monthStr = format(monthDate, 'yyyy-MM');

  // Une despesas (Transaction) + parcelas de cartão (Payable) por competência
  const purchases = useMemo(() => {
    const list = [];

    transactions
      .filter(t => t.type === 'expense' && (!t.status || ['registered', 'conciliated'].includes(t.status)))
      .filter(t => t.date && format(new Date(t.date), 'yyyy-MM') === monthStr)
      .forEach(t => {
        list.push({
          id: t.id,
          description: t.description,
          amount: t.amount,
          date: t.date,
          category: t.category,
          origin: t.card_id ? 'card' : 'account',
        });
      });

    // Parcelas de cartão: contam no mês do vencimento de cada parcela
    payables
      .filter(p => p.origin_type === 'card' && !p.is_card_invoice_payable && p.installment_group_id)
      .filter(p => p.due_date && format(new Date(p.due_date), 'yyyy-MM') === monthStr)
      .forEach(p => {
        list.push({
          id: p.id,
          description: p.installment_count
            ? `${p.description} (${p.installment_number}/${p.installment_count})`
            : p.description,
          amount: p.amount,
          date: p.due_date,
          category: p.category,
          origin: 'installment',
        });
      });

    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [transactions, payables, monthStr]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return purchases.filter(p => {
      const matchSearch = !s || p.description?.toLowerCase().includes(s) || String(p.amount).includes(s);
      const matchCat = filterCategory === 'all' || normalize(p.category) === normalize(filterCategory);
      const matchOrigin = filterOrigin === 'all' || p.origin === filterOrigin;
      return matchSearch && matchCat && matchOrigin;
    });
  }, [purchases, search, filterCategory, filterOrigin]);

  const total = filtered.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" />
            Compras do Mês
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Todas as compras, somando conta, cartão à vista e parcelas
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total filtrado</p>
          <p className="text-xl font-bold text-red-500">{fmt(total)}</p>
          <p className="text-xs text-muted-foreground">{filtered.length} compras</p>
        </div>
      </div>

      <PurchaseFilters
        search={search} setSearch={setSearch}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        filterOrigin={filterOrigin} setFilterOrigin={setFilterOrigin}
        categoryOptions={flatForSelect}
        monthDate={monthDate}
        onPrevMonth={() => setMonthDate(subMonths(monthDate, 1))}
        onNextMonth={() => setMonthDate(addMonths(monthDate, 1))}
      />

      <PurchaseList items={filtered} isLoading={loadingTx || loadingPay} getCategoryLabel={getCategoryLabel} />
    </div>
  );
}