import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ReviewFilters({
  search,
  setSearch,
  activeType,
  setActiveType,
  dateFilterMode,
  setDateFilterMode,
  selectedMonth,
  setSelectedMonth,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}) {
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
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_180px_180px]">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descrição, categoria, status, origem ou ID"
        />

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={dateFilterMode === 'month' ? 'default' : 'outline'}
            onClick={() => setDateFilterMode('month')}
            className="flex-1 text-[11px] font-bold uppercase"
          >
            Mês
          </Button>
          <Button
            size="sm"
            variant={dateFilterMode === 'range' ? 'default' : 'outline'}
            onClick={() => setDateFilterMode('range')}
            className="flex-1 text-[11px] font-bold uppercase"
          >
            Intervalo
          </Button>
        </div>

        {dateFilterMode === 'month' ? (
          <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        ) : (
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        )}

        {dateFilterMode === 'month' ? (
          <div className="flex items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
            Mês selecionado
          </div>
        ) : (
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        )}
      </div>
    </div>
  );
}