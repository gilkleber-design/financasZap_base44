import React, { useMemo } from 'react';
import { Pie, PieChart, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

const FALLBACK_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];

const formatCurrency = (value) => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpenseCategoryPieChart({ categories }) {
  const data = useMemo(() => {
    return (categories || [])
      .filter((item) => item.totalUsage > 0)
      .map((item, index) => ({
        name: item.name,
        value: item.totalUsage,
        fill: item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [categories]);

  const chartConfig = useMemo(() => {
    return data.reduce((acc, item) => {
      acc[item.name] = { label: item.name, color: item.fill };
      return acc;
    }, {});
  }, [data]);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!data.length) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-center">
      <ChartContainer config={chartConfig} className="mx-auto h-[280px] w-full max-w-[320px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-3">
              <span>{name}</span>
              <span className="font-semibold">{formatCurrency(value)}</span>
            </div>
          )} />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={3} strokeWidth={0}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">Distribuição por categoria</p>
          <p className="text-sm text-muted-foreground">Total auditado: {formatCurrency(total)}</p>
        </div>

        <div className="space-y-2">
          {data.map((item) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(item.value)}</p>
                  <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}