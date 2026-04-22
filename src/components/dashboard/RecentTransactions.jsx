import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', salario_clt: 'Salário CLT',
  receita_pj: 'Receita PJ', outros: 'Outros',
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function RecentTransactions({ transactions }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Lançamentos Recentes</CardTitle>
        <Link to="/lancamentos" className="text-xs text-primary flex items-center gap-1 hover:underline">
          Ver todos <ArrowUpRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum lançamento ainda</p>
        )}
        {transactions.map(tx => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tx.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {tx.date ? format(new Date(tx.date), 'dd/MM', { locale: ptBR }) : '—'}
                </span>
                {tx.category && (
                  <Badge variant="outline" className="text-xs py-0 px-1.5 h-4">
                    {CATEGORY_LABELS[tx.category] || tx.category}
                  </Badge>
                )}
                {tx.reconciled && (
                  <Badge className="text-xs py-0 px-1.5 h-4 bg-emerald-100 text-emerald-700 border-0">✓ Conciliado</Badge>
                )}
              </div>
            </div>
            <span className={`text-sm font-semibold ml-4 ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
              {tx.type === 'income' ? '+' : '-'}{fmt(tx.net_amount || tx.amount)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}