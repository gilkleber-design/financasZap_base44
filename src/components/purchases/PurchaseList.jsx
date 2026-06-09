import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CreditCard, Wallet, Layers } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const originMeta = {
  account: { label: 'Conta', icon: Wallet, cls: 'bg-sky-100 text-sky-700' },
  card: { label: 'Cartão', icon: CreditCard, cls: 'bg-violet-100 text-violet-700' },
  installment: { label: 'Parcelado', icon: Layers, cls: 'bg-amber-100 text-amber-700' },
};

export default function PurchaseList({ items, isLoading, getCategoryLabel }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {isLoading && (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma compra encontrada neste mês</div>
          )}
          {items.map(item => {
            const meta = originMeta[item.origin] || originMeta.account;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.cls}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {item.date ? format(new Date(item.date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </span>
                    {item.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{getCategoryLabel(item.category)}</Badge>}
                    <Badge className={`text-xs py-0 h-4 px-1.5 border-0 ${meta.cls}`}>{meta.label}</Badge>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 min-w-[90px]">
                  <p className="text-sm font-semibold text-red-500">-{fmt(item.amount)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}