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
import { useCategories } from '@/hooks/useCategories';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Transactions() {
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCreatedBy, setFilterCreatedBy] = useState('all');
  const [openReconciliation, setOpenReconciliation] = useState(false);
  const queryClient = useQueryClient();
  const { flatForSelect, getCategoryLabel } = useCategories();

  const { data: rawTransactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const transactions = rawTransactions.filter(t => 
    !t.status || t.status === 'registered' || t.status === 'conciliated'
  );

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // First try to physically delete it
      try {
        await base44.entities.Transaction.delete(id);
      } catch (err) {
        // If it fails (maybe RLS policy on delete), we do a soft delete by changing status
        await base44.entities.Transaction.update(id, { status: 'deleted' });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Transação removida'); setDeletingTx(null); },
  });

  const uniqueUsers = [...new Set(transactions.map(t => t.created_by).filter(Boolean))];

  const filtered = transactions.filter(t => {
    // Permite buscar também pelo ID ou valor se a descrição falhar
    const searchLower = search.toLowerCase();
    const matchSearch = !search || 
      t.description?.toLowerCase().includes(searchLower) ||
      t.amount?.toString().includes(searchLower) ||
      t.notes?.toLowerCase().includes(searchLower);
      
    const normalize = (str) => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const matchType = filterType === 'all' || t.type === filterType;
    const matchCat = filterCategory === 'all' || 
                     t.category === filterCategory || 
                     normalize(t.category) === normalize(filterCategory);
    const matchCreatedBy = filterCreatedBy === 'all' || t.created_by === filterCreatedBy;
    // Removendo o filtro rígido de ano atual para que você possa ver todas as transações, incluindo as de 2025 ou anos seguintes
    
    return matchSearch && matchType && matchCat && matchCreatedBy;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-sora font-bold">Transações</h1>
           <p className="text-muted-foreground text-sm mt-1">{transactions.length} transações no total</p>
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
            {flatForSelect.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.isChild ? `→ ${cat.label}` : cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCreatedBy} onValueChange={setFilterCreatedBy}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Usuário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {uniqueUsers.map(user => (
              <SelectItem key={user} value={user}>{user.split('@')[0]}</SelectItem>
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
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma transação encontrada</div>
            )}
            {filtered.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className={`w-2 h-10 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    {tx.status === 'conciliated' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {tx.date ? format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </span>
                    {tx.category && <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{getCategoryLabel(tx.category)}</Badge>}
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
               <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
               <AlertDialogDescription>
                 "{deletingTx.description}" — {deletingTx.date ? format(new Date(deletingTx.date), 'dd/MM/yyyy', { locale: ptBR }) : ''}
                 {deletingTx.status === 'conciliated' && <span className="block mt-1 text-amber-600 font-medium">⚠️ Esta transação está conciliada com uma conta. A conciliação será desfeita.</span>}
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