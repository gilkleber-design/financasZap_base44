import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fmt = (v) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(v || 0));

export default function MonthlyHospitalSummary({ items, totalShifts, totalAmount }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Resumo do mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.hospitalId} className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate font-medium text-foreground">{item.hospitalName}</span>
              <span className="shrink-0 text-muted-foreground text-right">
                {item.shiftCount} plant{item.shiftCount === 1 ? 'ão' : 'ões'} · {fmt(item.netAmount)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span>Total</span>
            <span className="shrink-0 text-right">
              {totalShifts} plant{totalShifts === 1 ? 'ão' : 'ões'} · {fmt(totalAmount)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}