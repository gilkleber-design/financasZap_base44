import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação',
  transporte: 'Transporte',
  moradia: 'Moradia',
  saude: 'Saúde',
  educacao: 'Educação',
  lazer: 'Lazer',
  vestuario: 'Vestuário',
  servicos: 'Serviços',
  impostos: 'Impostos',
  salario_clt: 'Salário CLT',
  receita_pj: 'Receita PJ',
  outros: 'Outros',
};

export default function CategoryChart({ data }) {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (!data.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
        <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          Nenhuma despesa neste mês
        </CardContent>
      </Card>
    );
  }

  // Ordena decrescente e limita aos 7 maiores
  const sorted = data
    .map(d => ({ ...d, name: CATEGORY_LABELS[d.name] || d.name }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7)
    .map(d => ({ ...d, name: d.name.replace(/_/g, ' ') }));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}