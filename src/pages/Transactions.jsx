import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Trash2, CheckCircle2, Pencil, FileUp } from 'lucide-react';
import EditTransactionModal from '@/components/transactions/EditTransactionModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import TransactionFormModal from '@/components/transactions/TransactionFormModal';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import BankStatementReconciliationModal from '@/components/reconciliation/BankStatementReconciliationModal';

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', salario_clt: 'Salário CLT',
  receita_pj: 'Receita PJ', outros: 'Outros',
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Transactions() {
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [openReconciliation, setOpenReconciliation] = useState(false);
  const queryClient = useQueryClient();

  const { data: rawTransactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const transactions = rawTransactions.filter(t => !t.status || t.status === 'registered' || t.status === 'conciliated');

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Lançamento removido'); setDeletingTx(null); },
  });

  const currentYear = new Date().getFullYear();
  const filtered = transactions.filter(t => {
    const matchSearch = !search || t.description?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || t.type === filterType;
    const matchCat = filterCategory === 'all' || t.category === filterCategory;
    const matchYear = t.date && new Date(t.date).getFullYear() === currentYear;
    return matchSearch && matchType && matchCat && matchYear;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-sora font-bold">Lançamentos</h1>
           <p className="text-muted-foreground text-sm mt-1">{transactions.length} lançamentos no total</p>
         </div>
         <div className="flex gap-2">
           <Button variant="outline" onClick={() => setOpenReconciliation(true)}>
             <FileUp className="w-4 h-4 mr-2" />
             Conciliar Extrato
           </Button>
           <Button onClick={() => setShowForm(true)}>
             <Plus className="w-4 h-4 mr-2" />
             Novo
           </Button>
         </div>
       </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading && (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lançamento encontrado</div>
            )}
            {filtered.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className={`w-2 h-10 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    {tx.reconciled && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {tx.date ? format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </span>
                    {tx.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{CATEGORY_LABELS[tx.category] || tx.category}</Badge>}
                    {tx.member && tx.member !== 'eu' && <Badge variant="secondary" className="text-xs py-0 h-4 px-1.5">{tx.member}</Badge>}
                    {tx.tax_rate > 0 && <Badge className="text-xs py-0 h-4 px-1.5 bg-amber-100 text-amber-700 border-0">IR {tx.tax_rate}%</Badge>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-primary flex-shrink-0"
                  onClick={() => setEditingTx(tx)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500 flex-shrink-0"
                  onClick={() => setDeletingTx(tx)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <div className="text-right flex-shrink-0 min-w-[90px]">
                  <p className={`text-sm font-semibold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.net_amount || tx.amount)}
                  </p>
                  {tx.tax_amount > 0 && (
                    <p className="text-xs text-muted-foreground">IR: {fmt(tx.tax_amount)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <TransactionFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { queryClient.invalidateQueries(); setShowForm(false); }}
        />
      )}
      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => { queryClient.invalidateQueries(); setEditingTx(null); }}
        />
      )}

      {deletingTx && (
         <AlertDialog open onOpenChange={() => setDeletingTx(null)}>
           <AlertDialogContent>
             <AlertDialogHeader>
               <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
               <AlertDialogDescription>
                 "{deletingTx.description}" — {deletingTx.date ? format(new Date(deletingTx.date), 'dd/MM/yyyy', { locale: ptBR }) : ''}
                 {deletingTx.reconciled && <span className="block mt-1 text-amber-600 font-medium">⚠️ Este lançamento está conciliado com uma conta. A conciliação será desfeita.</span>}
               </AlertDialogDescription>
             </AlertDialogHeader>
             <div className="flex gap-2">
               <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
               <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate(deletingTx.id)} disabled={deleteMutation.isPending}>
                 {deleteMutation.isPending ? 'Removendo...' : 'Excluir'}
               </Button>
             </div>
           </AlertDialogContent>
         </AlertDialog>
       )}

      <BankStatementReconciliationModal 
        open={openReconciliation} 
        onOpenChange={setOpenReconciliation} 
      />
    </div>
  );
}