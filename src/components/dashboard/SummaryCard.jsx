import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const colorMap = {
  success: 'text-emerald-600 bg-emerald-50',
  destructive: 'text-red-500 bg-red-50',
  warning: 'text-amber-600 bg-amber-50',
  primary: 'text-primary bg-accent',
};

export default function SummaryCard({ title, value, grossValue, icon: Icon, color = 'primary' }) {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const showGross = grossValue && grossValue > value;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={cn(
              "text-xl font-sora font-bold mt-1",
              color === 'success' ? 'text-emerald-600' :
              color === 'destructive' ? 'text-red-500' :
              color === 'warning' ? 'text-amber-600' : 'text-foreground'
            )}>
              {fmt(value)}
            </p>
            {showGross && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">{fmt(grossValue)} bruto</p>
            )}
          </div>
          <div className={cn('p-2 rounded-lg', colorMap[color] || colorMap.primary)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}