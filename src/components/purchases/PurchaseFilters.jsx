import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PurchaseFilters({
  search, setSearch,
  filterCategory, setFilterCategory,
  filterOrigin, setFilterOrigin,
  categoryOptions,
  monthDate, onPrevMonth, onNextMonth,
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-card rounded-xl border px-3 py-2">
        <Button variant="ghost" size="icon" onClick={onPrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">
          {format(monthDate, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={onNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar compra..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.isChild ? `→ ${cat.label}` : cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            <SelectItem value="account">Conta</SelectItem>
            <SelectItem value="card">Cartão (à vista)</SelectItem>
            <SelectItem value="installment">Cartão (parcelado)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}