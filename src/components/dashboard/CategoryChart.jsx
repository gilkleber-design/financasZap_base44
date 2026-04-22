import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
  const labeled = data.map(d => ({ ...d, name: CATEGORY_LABELS[d.name] || d.name }));

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

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={labeled} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {labeled.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}