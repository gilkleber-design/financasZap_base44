import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Copy, Save, Target } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CurrencyInput } from '@/components/ui/currency-input';
import { debounce } from 'lodash';

export default function Planning() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    const queryClient = useQueryClient();
    
    const [localBudgets, setLocalBudgets] = useState({});
    const [savingId, setSavingId] = useState(null);

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => base44.entities.Category.list('', 500)
    });
    
    const { data: budgets = [], isLoading } = useQuery({
        queryKey: ['budgets', month, year],
        queryFn: () => base44.entities.Budget.filter({ month, year }, '', 500),
    });

    const prevMonthYear = React.useRef(`${month}-${year}`);

    React.useEffect(() => {
        const isNewMonth = prevMonthYear.current !== `${month}-${year}`;
        prevMonthYear.current = `${month}-${year}`;

        setLocalBudgets(prev => {
            const map = isNewMonth ? {} : { ...prev };
            budgets.forEach(b => {
                // Preenche com os dados do banco apenas se for mês novo ou se não havia edição local
                if (isNewMonth || prev[b.category_id] === undefined) {
                    map[b.category_id] = b.amount;
                }
            });
            return map;
        });
    }, [budgets, month, year]);

    const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

    const handleClone = async () => {
        const prev = subMonths(currentDate, 1);
        try {
            await base44.functions.invoke('cloneBudget', {
                source_month: prev.getMonth() + 1,
                source_year: prev.getFullYear(),
                target_month: month,
                target_year: year
            });
            toast.success('Orçamento clonado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['budgets', month, year] });
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Erro ao clonar orçamento');
        }
    };

    const saveMutation = useMutation({
        mutationFn: async ({ categoryId, amount }) => {
            const currentBudgets = queryClient.getQueryData(['budgets', month, year]) || [];
            const existing = currentBudgets.find(b => b.category_id === categoryId);
            if (existing) {
                return await base44.entities.Budget.update(existing.id, { amount });
            } else {
                return await base44.entities.Budget.create({
                    category_id: categoryId,
                    month,
                    year,
                    amount
                });
            }
        },
        onMutate: ({ categoryId }) => {
            setSavingId(categoryId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets', month, year] });
        },
        onError: () => {
            toast.error('Erro ao salvar orçamento');
        },
        onSettled: () => {
            setSavingId(null);
        }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSave = useCallback(
        debounce((categoryId, amount) => {
            saveMutation.mutate({ categoryId, amount });
        }, 800),
        [month, year, queryClient]
    );

    const handleBudgetChange = (categoryId, val) => {
        const amount = parseFloat(val) || 0;
        setLocalBudgets(prev => ({ ...prev, [categoryId]: val }));
        debouncedSave(categoryId, amount);
    };

    const expenseCategories = categories.filter(c => c.type === 'expense' && c.active !== false);

    // Cálculo do total planejado somando os valores em tempo real dos inputs
    const totalPlanned = expenseCategories.reduce((acc, cat) => {
        return acc + (parseFloat(localBudgets[cat.id]) || 0);
    }, 0);

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            {/* Header da Página */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-sora font-bold text-foreground flex items-center gap-2">
                        <Target className="w-6 h-6 text-primary" />
                        Planejamento Financeiro
                    </h1>
                    <p className="text-muted-foreground text-sm">Defina limites de gastos por categoria para o mês</p>
                </div>
                
                <div className="flex items-center justify-between w-full md:w-auto gap-2 bg-card px-3 py-2 rounded-xl shadow-sm border">
                    <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <span className="font-medium text-base min-w-[130px] text-center capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                    </span>
                    <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Total do Planejamento - AGORA NO TOPO */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-5 bg-primary/10 border border-primary/20 rounded-xl shadow-sm gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <Target className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <p className="font-bold text-foreground">Total Planejado</p>
                        <p className="text-xs text-muted-foreground">Soma de todas as metas do mês</p>
                    </div>
                </div>
                <div className="text-2xl font-sora font-bold text-primary">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPlanned)}
                </div>
            </div>

            {/* Card com Detalhes das Categorias */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b gap-4">
                    <CardTitle className="text-lg">Orçamento Mensal</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleClone} className="gap-2 shrink-0">
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline">Copiar do mês anterior</span>
                    </Button>
                </CardHeader>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {expenseCategories.length === 0 && (
                                <p className="text-center text-muted-foreground py-4">Nenhuma categoria de despesa encontrada.</p>
                            )}
                            {expenseCategories.map(cat => {
                                const currentSaved = budgets.find(b => b.category_id === cat.id)?.amount || 0;
                                const localVal = parseFloat(localBudgets[cat.id]) || 0;
                                const isModified = localVal !== currentSaved;

                                return (
                                    <div key={cat.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: cat.color || '#94a3b8' }}>
                                                <span className="text-lg font-bold">{cat.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground leading-tight">{cat.name}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 sm:ml-auto">
                                            <CurrencyInput 
                                                className="w-full sm:w-40 text-right font-medium"
                                                value={localBudgets[cat.id] ?? ''}
                                                onChange={(val) => handleBudgetChange(cat.id, val)}
                                                placeholder="R$ 0,00"
                                            />
                                            <div className="w-9 h-9 flex items-center justify-center shrink-0">
                                                {savingId === cat.id ? (
                                                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                                ) : isModified ? (
                                                    <div className="w-2 h-2 rounded-full bg-amber-400" title="Alterações pendentes" />
                                                ) : (
                                                    <Save className="w-4 h-4 text-muted-foreground/30" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}