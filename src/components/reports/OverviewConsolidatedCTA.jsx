import React from 'react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function OverviewConsolidatedCTA({ currentMonth, onOpen }) {
  return (
    <div className="rounded-r-xl border-l-[3px] border-l-[#0D3B66] bg-[#EEF5FB] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#0D3B66]">
            Relatório consolidado — {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </p>
          <p className="mt-0.5 text-xs text-[#0D3B66]/70">
            Receitas · Despesas · Saldo · Posição fiscal
          </p>
        </div>
        <Button onClick={onOpen} className="bg-[#0D3B66] text-white hover:bg-[#0D3B66]/90">
          Ver completo
        </Button>
      </div>
    </div>
  );
}