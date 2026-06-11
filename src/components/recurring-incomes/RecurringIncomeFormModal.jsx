import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { CategorySelect } from '@/components/ui/category-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function RecurringIncomeFormModal({ initial, onClose, onSaved }) {
    const isEdit = !!initial;
    
    const [description, setDescription] = useState(initial?.description || '');
    const [defaultAmount, setDefaultAmount] = useState(initial?.default_amount || 0);
    const [categoryId, setCategoryId] = useState(initial?.category_id || '');
    const [incomeSourceId, setIncomeSourceId] = useState(initial?.income_source_id || 'none');
    const [dueDay, setDueDay] = useState(initial?.due_day || '');
    const [notes, setNotes] = useState(initial?.notes || '');
    
    const [preCheck, setPreCheck] = useState(initial?.pre_check ?? true);
    const [lockAmount, setLockAmount] = useState(initial?.lock_amount || false);
    const [rememberLast, setRememberLast] = useState(initial?.remember_last || false);

    const [isSaving, setIsSaving] = useState(false);

    const { data: incomeSources = [] } = useQuery({
        queryKey: ['incomeSources'],
        queryFn: () => base44.entities.IncomeSource.list(),
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!description.trim() || !defaultAmount) {
            toast.error('Preencha a descrição e o valor base.');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                description,
                default_amount: defaultAmount,
                category_id: categoryId || null,
                income_source_id: incomeSourceId === 'none' ? null : incomeSourceId,
                due_day: dueDay ? Number(dueDay) : null,
                notes: notes || null,
                pre_check: preCheck,
                lock_amount: lockAmount,
                remember_last: lockAmount ? false : rememberLast,
                active: initial ? initial.active : true
            };

            if (isEdit) {
                await base44.entities.RecurringIncome.update(initial.id, payload);
                toast.success('Receita atualizada com sucesso!');
            } else {
                await base44.entities.RecurringIncome.create(payload);
                toast.success('Receita criada com sucesso!');
            }
            onSaved();
        } catch (error) {
            toast.error('Erro ao salvar: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="font-sora sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Editar Receita Recorrente' : 'Nova Receita Recorrente'}</DialogTitle>
                    <DialogDescription>
                        Template sugerido em todo fechamento de mês.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Input 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Ex: Salário Afya" 
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Valor Base</Label>
                            <CurrencyInput
                                value={defaultAmount}
                                onChange={setDefaultAmount}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Dia Previsto (1-31)</Label>
                            <Input 
                                type="number"
                                min="1" max="31"
                                value={dueDay}
                                onChange={e => setDueDay(e.target.value)}
                                placeholder="Opcional"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Categoria</Label>
                        <CategorySelect
                            value={categoryId}
                            onChange={setCategoryId}
                            typeFilter="income"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Fonte de Renda (opcional)</Label>
                        <Select value={incomeSourceId} onValueChange={setIncomeSourceId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {incomeSources.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-4 my-2">
                        <h4 className="text-sm font-bold text-slate-700">Comportamento no Fechamento</h4>
                        
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Vir pré-marcada</Label>
                                <p className="text-xs text-muted-foreground">Vem incluída por padrão no mês.</p>
                            </div>
                            <Switch checked={preCheck} onCheckedChange={setPreCheck} />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Travar valor (🔒)</Label>
                                <p className="text-xs text-muted-foreground">Impede a edição do valor avulso na hora de fechar.</p>
                            </div>
                            <Switch checked={lockAmount} onCheckedChange={setLockAmount} />
                        </div>

                        {!lockAmount && (
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-sm">Lembrar último valor</Label>
                                    <p className="text-xs text-muted-foreground">Usa o valor do último mês em vez do valor base.</p>
                                </div>
                                <Switch checked={rememberLast} onCheckedChange={setRememberLast} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea 
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Notas padrão..." 
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}