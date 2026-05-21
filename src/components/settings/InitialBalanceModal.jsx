import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

export default function InitialBalanceModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [targetBalance, setTargetBalance] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!targetBalance || !date) return toast.error('Preencha os campos obrigatórios');
        setLoading(true);
        try {
            const res = await base44.functions.invoke('adjustInitialBalance', { 
                targetBalance: parseFloat(targetBalance), 
                date 
            });
            if (res.data?.error) throw new Error(res.data.error);
            
            toast.success('Saldo ajustado com sucesso!');
            queryClient.invalidateQueries();
            onOpenChange(false);
            setTargetBalance('');
        } catch (e) {
            toast.error('Erro ao ajustar saldo: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajuste de Saldo Inicial Geral</DialogTitle>
                    <DialogDescription>
                        Informe o saldo real de suas contas em uma data específica. O sistema calculará a diferença para o saldo interno do app e criará automaticamente uma transação de ajuste.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Data Base para o Saldo</Label>
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Saldo Real na Data (R$)</Label>
                        <Input 
                            type="number" 
                            step="0.01"
                            placeholder="Ex: 5000.00" 
                            value={targetBalance} 
                            onChange={e => setTargetBalance(e.target.value)} 
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Ajustar Saldo
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}