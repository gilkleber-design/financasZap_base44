import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { addMonths, startOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import RecurrenceFormModal from '@/components/recurrences/RecurrenceFormModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', outros: 'Outros',
};

const CATEGORY_COLORS = {
  moradia: 'bg-blue-100 text-blue-700',
  servicos: 'bg-purple-100 text-purple-700',
  alimentacao: 'bg-orange-100 text-orange-700',
  saude: 'bg-red-100 text-red-700',
  educacao: 'bg-green-100 text-green-700',
  transporte: 'bg-yellow-100 text-yellow-700',
  lazer: 'bg-pink-100 text-pink-700',
  impostos: 'bg-gray-100 text-gray-700',
  outros: 'bg-slate-100 text-slate-700',
};

// Gera 13 Payables futuros a partir do mês atual para uma recorrência
async function generatePayables(recurrence) {
  const now = new Date();
  const payables = [];
  
  // Importa a função apenas quando necessária
  const { getFifthBusinessDay } = await import('@/lib/businessDayCalculator');

  for (let i = 0; i < 13; i++) {
    const targetMonth = addMonths(startOfMonth(now), i);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    
    let dueDate;
    
    if (recurrence.fifth_business_day) {
      // Calcula o 5º dia útil
      dueDate = getFifthBusinessDay(new Date(year, month, 1));
    } else {
      // Usa o dia da recorrência
      const maxDay = new Date(year, month + 1, 0).getDate();
      const day = Math.min(recurrence.due_day, maxDay);
      dueDate = format(new Date(year, month, day, 12, 0, 0), 'yyyy-MM-dd');
    }

    payables.push({
      description: recurrence.description,
      amount: recurrence.amount,
      due_date: dueDate,
      category: recurrence.category,
      status: 'pending',
      recurrent: true,
      fifth_business_day: recurrence.fifth_business_day,
      notes: `Gerado automaticamente — Recorrência: ${recurrence.description}`,
    });
  }

  await base44.entities.Payable.bulkCreate(payables);
  return payables.length;
}

export default function Recurrences() {
  const [showForm, setShowForm] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState(null);
  const [deletingRecurrence, setDeletingRecurrence] = useState(null);
  const queryClient = useQueryClient();

  const { data: recurrences = [], isLoading } = useQuery({
    queryKey: ['recurrences'],
    queryFn: () => base44.entities.Recurrence.list('-created_date', 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recurrence.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['recurrences']); toast.success('Recorrência removida'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Recurrence.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries(['recurrences']),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (recurrence) => {
      const count = await generatePayables(recurrence);
      return count;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries(['payables']);
      toast.success(`${count} lançamentos futuros gerados!`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recurrence.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['recurrences']);
      setEditingRecurrence(null);
      toast.success('Recorrência atualizada!');
    },
  });

  const handleDelete = async () => {
    // Deleta todos os payables associados
    const payables = await base44.entities.Payable.list('-due_date', 500);
    const toDelete = payables.filter(p => p.description === deletingRecurrence.description);
    for (const p of toDelete) await base44.entities.Payable.delete(p.id);
    
    // Deleta a recorrência
    await deleteMutation.mutateAsync(deletingRecurrence.id);
    await queryClient.invalidateQueries(['payables']);
    setDeletingRecurrence(null);
  };

  const handleCreated = async (recurrence) => {
    setShowForm(false);
    setEditingRecurrence(null);
    queryClient.invalidateQueries(['recurrences']);
    // Gera payables automaticamente
    const count = await generatePayables(recurrence);
    queryClient.invalidateQueries(['payables']);
    toast.success(`Recorrência ${editingRecurrence ? 'atualizada' : 'criada'}! ${count} lançamentos futuros gerados.`);
  };

  const active = recurrences.filter(r => r.active !== false);
  const inactive = recurrences.filter(r => r.active === false);
  const totalMonthly = active.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold">Despesas Recorrentes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {active.length} ativas · {fmt(totalMonthly)}/mês
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Recorrência
        </Button>
      </div>

      {/* Cards de resumo por categoria */}
      {active.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(
            active.reduce((acc, r) => {
              const cat = r.category || 'outros';
              acc[cat] = (acc[cat] || 0) + r.amount;
              return acc;
            }, {})
          ).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
            <Card key={cat} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <Badge className={`text-xs mb-1 border-0 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.outros}`}>
                  {CATEGORY_LABELS[cat] || cat}
                </Badge>
                <p className="text-base font-bold text-foreground">{fmt(total)}</p>
                <p className="text-xs text-muted-foreground">por mês</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lista de recorrências ativas */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Ativas ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>}
            {!isLoading && active.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma recorrência cadastrada. Crie sua primeira!
              </p>
            )}
            {active.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="w-2 h-10 rounded-full flex-shrink-0 bg-primary/40" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">Todo dia {r.due_day}</span>
                    <Badge className={`text-xs py-0 h-4 px-1.5 border-0 ${CATEGORY_COLORS[r.category] || CATEGORY_COLORS.outros}`}>
                      {CATEGORY_LABELS[r.category] || r.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-slate-500 hover:text-slate-700"
                    title="Editar"
                    onClick={() => setEditingRecurrence(r)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-blue-500 hover:text-blue-700"
                    title="Regerar próximos 12 meses"
                    onClick={() => regenerateMutation.mutate(r)}
                    disabled={regenerateMutation.isPending}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-amber-500"
                    title="Desativar"
                    onClick={() => toggleMutation.mutate({ id: r.id, active: false })}
                  >
                    <ToggleRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500"
                    onClick={() => setDeletingRecurrence(r)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="text-right flex-shrink-0 min-w-[80px]">
                  <p className="text-sm font-semibold text-red-500">-{fmt(r.amount)}</p>
                  <span className="text-xs text-muted-foreground">mensal</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Inativas */}
      {inactive.length > 0 && (
        <Card className="border-0 shadow-sm opacity-60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Inativas ({inactive.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {inactive.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-2 h-10 rounded-full flex-shrink-0 bg-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground line-through">{r.description}</p>
                    <span className="text-xs text-muted-foreground">Todo dia {r.due_day}</span>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground"
                    title="Reativar"
                    onClick={() => toggleMutation.mutate({ id: r.id, active: true })}
                  >
                    <ToggleLeft className="w-4 h-4" />
                  </Button>
                  <div className="text-right flex-shrink-0 min-w-[80px]">
                    <p className="text-sm font-semibold text-muted-foreground">{fmt(r.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(showForm || editingRecurrence) && (
        <RecurrenceFormModal
          initial={editingRecurrence}
          onClose={() => { setShowForm(false); setEditingRecurrence(null); }}
          onSaved={handleCreated}
        />
      )}

      {deletingRecurrence && (
        <AlertDialog open onOpenChange={() => setDeletingRecurrence(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover recorrência?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso vai deletar a recorrência "{deletingRecurrence.description}" e todos os lançamentos gerados associados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                Remover
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}