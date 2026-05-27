import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ReviewFilters({ search, setSearch, activeType, setActiveType }) {
  const tabs = [
    { key: 'payables', label: 'Payables' },
    { key: 'receivables', label: 'Receivables' },
    { key: 'transactions', label: 'Transactions' },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeType === tab.key ? 'default' : 'outline'}
            onClick={() => setActiveType(tab.key)}
            className="text-[11px] font-bold uppercase"
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por descrição, categoria, status, origem ou ID"
      />
    </div>
  );
}