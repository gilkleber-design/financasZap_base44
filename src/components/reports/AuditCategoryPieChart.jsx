import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

const fmt = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

import { normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

export default function AuditCategoryPieChart({ auditData, categories }) {
  const chartData = useMemo(() => {
    const categoryMap = new Map((categories || []).map((cat) => [cat.id || cat.slug, cat]));
    const grouped = (auditData || []).reduce((acc, item) => {
      const key = item.category_id || item.category || 'sem_categoria';
      const matched = categoryMap.get(key) || Array.from(categoryMap.values()).find((cat) => cat.slug === key);
      const name = normalizeCategoryLabel(matched?.name || matched?.slug || item.category || 'Sem categoria');
      acc[name] = (acc[name] || 0) + Number(item.amount || 0);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [auditData, categories]);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (!chartData.length) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
              {chartData.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => fmt(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">Despesas por categoria</h3>
          <p className="text-sm text-muted-foreground">Total auditado: {fmt(total)}</p>
        </div>

        <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
          {chartData.map((item, index) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-950 dark:text-white">{fmt(item.value)}</div>
                  <div className="text-xs text-muted-foreground">{percent.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}