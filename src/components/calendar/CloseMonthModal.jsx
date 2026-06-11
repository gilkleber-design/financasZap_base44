import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Lock, Plus, Info, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function CloseMonthModal({ monthStart, onClose, onClosed }) {
    const month = monthStart.getMonth() + 1;
    const year = monthStart.getFullYear();
    const queryClient = useQueryClient();

    const [isSaving, setIsSaving] = useState(false);
    
    // UI State
    const [shiftStatuses, setShiftStatuses] = useState({}); // { id: 'done' | 'cancelled' }
    const [incomes, setIncomes] = useState([]); // [{ id, recurring_income_id, description, amount, category_id, notes, checked }]

    // Fetch Preview
    const { data: preview, isLoading, error } = useQuery({
        queryKey: ['month-closure-preview', month, year],
        queryFn: async () => {
            const res = await base44.functions.invoke('getMonthClosurePreview', { month, year });
            return res.data;
        }
    });

    // Also fetch shifts for the list (since preview only returned count/total, we need the actual list for the UI checkboxes)
    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts-to-close', month, year],
        queryFn: async () => {
            const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
            const startDate = `${monthPrefix}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${monthPrefix}-${lastDay.toString().padStart(2, '0')}`;
            const allShifts = await base44.entities.Shift.filter({
                date: { $gte: startDate, $lte: endDate },
            });
            // Filter closable
            return allShifts.filter(s => !s.is_avista && s.status !== 'passed' && !s.receivable_id);
        }
    });

    const { data: hospitals = [] } = useQuery({ queryKey: ['hospitals'], queryFn: () => base44.entities.Hospital.list() });

    // Initialize state when preview loads
    useEffect(() => {
        if (preview && shifts.length > 0 && Object.keys(shiftStatuses).length === 0) {
            const initialShifts = {};
            shifts.forEach(s => {
                initialShifts[s.id] = s.status === 'cancelled' ? 'cancelled' : 'done';
            });
            setShiftStatuses(initialShifts);

            const initialIncomes = preview.recurring_incomes.map(ri => ({
                id: ri.id,
                recurring_income_id: ri.id,
                description: ri.description,
                amount: ri.suggested_amount,
                category_id: ri.category_id,
                notes: '',
                checked: ri.pre_check,
                lock_amount: ri.lock_amount
            }));
            setIncomes(initialIncomes);
        }
    }, [preview, shifts]);

    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            const finalIncomes = incomes
                .filter(i => i.checked)
                .map(i => ({
                    recurring_income_id: i.recurring_income_id || null,
                    description: i.description,
                    amount: i.amount,
                    category_id: i.category_id,
                    notes: i.notes || null
                }));

            const res = await base44.functions.invoke('closeMonth', {
                month,
                year,
                shift_statuses: shiftStatuses,
                incomes: finalIncomes
            });

            if (res.data.error) throw new Error(res.data.error);

            toast.success('M\u00eas fechado com sucesso!');
            onClosed();
        } catch (err) {
            toast.error(err.message || 'Erro ao fechar o m\u00eas');
        } finally {
            setIsSaving(false);
        }
    };

    const addAvulso = () => {
        setIncomes([...incomes, {
            id: `avulso_${Date.now()}`,
            recurring_income_id: null,
            description: 'Nova Receita Extra',
            amount: 0,
            category_id: null,
            notes: '',
            checked: true,
            lock_amount: false
        }]);
    };

    const toggleShift = (id) => {
        setShiftStatuses(prev => ({
            ...prev,
            [id]: prev[id] === 'done' ? 'cancelled' : 'done'
        }));
    };

    const updateIncome = (id, field, value) => {
        setIncomes(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    if (isLoading) return <Dialog open><DialogContent><div className="p-8 text-center">Carregando pr\u00e9via...</div></DialogContent></Dialog>;
    if (error) return <Dialog open onOpenChange={onClose}><DialogContent><div className="p-8 text-center text-red-500">Erro: {error.message}</div></DialogContent></Dialog>;

    const selectedShiftsTotal = shifts.filter(s => shiftStatuses[s.id] === 'done').reduce((acc, s) => acc + (Number(s.valor) || 0) + (Number(s.valor_producao) || 0), 0);
    const selectedIncomesTotal = incomes.filter(i => i.checked).reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    const totalExpected = selectedShiftsTotal + selectedIncomesTotal;

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="font-sora sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-border shrink-0">
                    <DialogTitle className="text-xl">FECHAMENTO DE {format(monthStart, 'MMMM/yyyy', {locale: ptBR}).toUpperCase()}</DialogTitle>
                    <DialogDescription>Confirme os plant\u00f5es e receitas para gerar os receb\u00edveis do m\u00eas.</DialogDescription>
                </div>

                <ScrollArea className="flex-1 px-6 py-4">
                    <div className="space-y-6">
                        {/* PLANT\u00d5ES */}
                        <section>
                            <h3 className="text-xs font-bold text-slate-500 mb-3 tracking-widest uppercase">PLANT\u00d5ES ({shifts.filter(s=>shiftStatuses[s.id]==='done').length})</h3>
                            <div className="space-y-2">
                                {shifts.length === 0 && <p className="text-sm text-slate-400">Nenhum plant\u00e3o pendente.</p>}
                                {shifts.map(shift => {
                                    const hospital = hospitals.find(h => h.id === shift.hospital_id);
                                    const val = (Number(shift.valor) || 0) + (Number(shift.valor_producao) || 0);
                                    const isDone = shiftStatuses[shift.id] === 'done';
                                    
                                    return (
                                        <div key={shift.id} className={`flex items-center justify-between p-2 rounded-lg border ${isDone ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-transparent opacity-60'}`}>
                                            <div className="flex items-center gap-3">
                                                <Checkbox checked={isDone} onCheckedChange={() => toggleShift(shift.id)} />
                                                <div className="text-sm">
                                                    <span className={`font-bold ${isDone ? 'text-slate-700' : 'line-through text-slate-400'}`}>
                                                        {hospital?.sigla || 'Hosp'} — {shift.type} {format(new Date(`${shift.date}T12:00:00`), 'dd/MM')}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-sm font-semibold text-slate-600">
                                                {isDone ? fmt(val) : 'Cancelado'}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="text-right text-sm font-bold text-slate-700 pt-2">
                                    Subtotal: {fmt(selectedShiftsTotal)}
                                </div>
                            </div>
                        </section>

                        {/* RECEITAS RECORRENTES */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-slate-500 tracking-widest uppercase">RECEITAS EXTRAS E BOLSAS</h3>
                            </div>
                            <div className="space-y-3">
                                {incomes.map((inc, idx) => (
                                    <div key={inc.id} className={`p-3 rounded-lg border ${inc.checked ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-transparent opacity-60'}`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <Checkbox checked={inc.checked} onCheckedChange={(v) => updateIncome(inc.id, 'checked', v)} />
                                            <div className="flex-1">
                                                <Input 
                                                    value={inc.description} 
                                                    onChange={e => updateIncome(inc.id, 'description', e.target.value)}
                                                    className="h-7 text-sm font-bold bg-transparent border-none px-0 shadow-none focus-visible:ring-0"
                                                    disabled={!inc.checked || inc.lock_amount}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {inc.lock_amount && <Lock className="w-3 h-3 text-amber-600" />}
                                                <Input 
                                                    type="number"
                                                    value={inc.amount}
                                                    onChange={e => updateIncome(inc.id, 'amount', e.target.value)}
                                                    disabled={!inc.checked || inc.lock_amount}
                                                    className="w-28 h-7 text-sm text-right font-semibold"
                                                />
                                            </div>
                                        </div>
                                        {inc.checked && (
                                            <div className="pl-7">
                                                <Input 
                                                    placeholder="Adicionar nota (ex: f\u00e9rias, horas extras)..." 
                                                    value={inc.notes}
                                                    onChange={e => updateIncome(inc.id, 'notes', e.target.value)}
                                                    className="h-6 text-xs text-muted-foreground border-transparent bg-transparent shadow-none px-0"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addAvulso} className="w-full text-xs border-dashed">
                                    <Plus className="w-3 h-3 mr-2" /> Adicionar Receita Avulsa
                                </Button>
                                <div className="text-right text-sm font-bold text-slate-700 pt-2">
                                    Subtotal: {fmt(selectedIncomesTotal)}
                                </div>
                            </div>
                        </section>
                    </div>
                </ScrollArea>

                <div className="px-6 py-4 bg-slate-100 border-t border-border shrink-0 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">TOTAL ESPERADO</p>
                        <p className="text-2xl font-black text-primary">{fmt(totalExpected)}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                        <Button onClick={handleConfirm} disabled={isSaving} className="bg-primary hover:bg-primary/90">
                            {isSaving ? 'Fechando...' : 'Confirmar Fechamento'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}