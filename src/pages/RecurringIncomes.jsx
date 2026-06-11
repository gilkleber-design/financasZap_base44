import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Repeat, Lock, CheckCircle2, Edit2, PowerOff, Power } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import RecurringIncomeFormModal from '@/components/recurring-incomes/RecurringIncomeFormModal';
import DashboardLogo from '@/components/dashboard/DashboardLogo';
import { getInitials } from '@/components/dashboard/financaszapTheme';

const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v || 0);

export default function RecurringIncomes() {
  const [showInactive, setShowInactive] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: incomes = [], isLoading } = useQuery({
    queryKey: ['recurring-incomes'],
    queryFn: () => base44.entities.RecurringIncome.list('-created_date', 500),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
  });

  const filtered = incomes.filter(i => showInactive ? !i.active : i.active);

  const toggleStatusMutation = useMutation({
    mutationFn: (item) => base44.entities.RecurringIncome.update(item.id, { active: !item.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-incomes'] })
  });

  const getCategoryName = (id, fallback) => {
    if (!id) return fallback || 'Sem categoria';
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : fallback || 'Sem categoria';
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6 font-sora p-4 md:p-6 text-slate-800">
      
      <div className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 py-3 -mx-6 -mt-6 mb-6">
        <div className="flex items-center gap-3">
          <DashboardLogo className="h-5 w-5" />
          <div className="text-lg font-bold"><span className="text-foreground">Finanças</span><span className="text-primary">Zap</span></div>
          <span className="h-5 w-px bg-border" />
          <p className="text-sm text-muted-foreground">Receitas Recorrentes</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Repeat className="w-6 h-6 text-primary" />
            Receitas Recorrentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie sal\u00e1rios e bolsas que se repetem mensalmente</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? 'Mostrar Ativas' : 'Mostrar Inativas'}
          </Button>
          <Button onClick={() => { setEditingItem(null); setIsFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nova Receita
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && <p className="text-muted-foreground text-sm col-span-full">Carregando...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-muted-foreground text-sm col-span-full">Nenhuma receita encontrada.</p>
        )}
        {filtered.map(item => (
          <Card key={item.id} className={`overflow-hidden transition-opacity ${!item.active ? 'opacity-60' : ''}`}>
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg leading-tight">{item.description}</h3>
                <span className="font-black text-primary bg-primary/10 px-2 py-1 rounded text-sm">
                  {fmt(item.default_amount)}/m\u00eas
                </span>
              </div>
              
              <div className="text-sm text-slate-500 mb-4 space-y-1">
                <p>Dia {item.due_day || '--'} &middot; Categoria: {getCategoryName(item.category_id, item.category)}</p>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-[10px] mt-2">
                  {item.lock_amount && <span className="flex items-center text-amber-700 bg-amber-100 px-2 py-0.5 rounded"><Lock className="w-3 h-3 mr-1" /> VALOR TRAVADO</span>}
                  {item.pre_check && <span className="flex items-center text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded"><CheckCircle2 className="w-3 h-3 mr-1" /> PR\u00c9-MARCADA</span>}
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 mb-4 border border-slate-100">
                \u00daltimo recebido: <strong className="text-slate-800">{item.last_amount ? fmt(item.last_amount) : '---'}</strong> em {item.last_received_at ? format(new Date(`${item.last_received_at}T12:00:00`), 'dd/MM/yyyy') : '---'}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="ghost" size="sm" onClick={() => toggleStatusMutation.mutate(item)} className={!item.active ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-red-600'}>
                  {!item.active ? <Power className="w-4 h-4 mr-1" /> : <PowerOff className="w-4 h-4 mr-1" />}
                  {!item.active ? 'Ativar' : 'Desativar'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setEditingItem(item); setIsFormOpen(true); }}>
                  <Edit2 className="w-4 h-4 mr-1" /> Editar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isFormOpen && (
        <RecurringIncomeFormModal 
          initial={editingItem} 
          onClose={() => setIsFormOpen(false)} 
          onSaved={() => { setIsFormOpen(false); queryClient.invalidateQueries({ queryKey: ['recurring-incomes']}); }} 
        />
      )}
    </div>
  );
}