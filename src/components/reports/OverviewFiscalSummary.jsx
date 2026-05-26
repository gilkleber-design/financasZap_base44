import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function MiniCard({ label, value, valueClassName, subtext, children }) {
  return (
    <Card className="border border-[#E8EDF2] shadow-sm">
      <CardContent className="p-4">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.05em] text-[#7B92A8]">{label}</p>
        <p className={`text-[18px] font-bold ${valueClassName}`}>{value}</p>
        {subtext && <p className="mt-1 text-[11px] text-[#7B92A8]">{subtext}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

export default function OverviewFiscalSummary({ totalGross, totalTax, totalNet, effectiveRate, sourceRows }) {
  return (
    <div className="space-y-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#7B92A8]">Resumo fiscal</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniCard
          label="Total bruto"
          value={fmt(totalGross)}
          valueClassName="text-[#0D3B66]"
          subtext="plantões no período"
        />

        <MiniCard
          label="Impostos retidos"
          value={fmt(totalTax)}
          valueClassName="text-[#C0622A]"
          subtext={`${effectiveRate} alíquota efetiva`}
        >
          <div className="mt-3 space-y-2">
            {sourceRows.length === 0 ? (
              <p className="text-[11px] text-[#7B92A8]">Nenhum imposto registrado.</p>
            ) : (
              sourceRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between border-t border-[#E8EDF2] pt-2 text-[11px]">
                  <span className="text-[#7B92A8]">{row.name}</span>
                  <span className="font-bold text-[#C0622A]">{fmt(row.tax)}</span>
                </div>
              ))
            )}
          </div>
        </MiniCard>

        <MiniCard
          label="Total líquido"
          value={fmt(totalNet)}
          valueClassName="text-[#0A6E50]"
          subtext="após impostos"
        />
      </div>
    </div>
  );
}