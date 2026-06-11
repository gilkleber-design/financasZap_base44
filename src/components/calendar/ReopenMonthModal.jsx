import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileText, Coins, Calendar, CheckCircle2 } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ReopenMonthModal({ monthStart, onClose, onReopened }) {
  const month = monthStart.getMonth() + 1;
  const year = monthStart.getFullYear();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: impact, isLoading, error } = useQuery({
    queryKey: ['reopen-impact', month, year],
    queryFn: async () => {
      const res = await base44.functions.invoke('getMonthReopenImpact', { month, year });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    }
  });

  const handleConfirm = async () => {
    if (reason.length < 3) {
      toast.error('Informe um motivo v\u00e1lido (m\u00ednimo 3 caracteres).');
      return;
    }
    setIsSaving(true);
    try {
      const res = await base44.functions.invoke('reopenMonth', { month, year, reason });
      if (res.data.error) throw new Error(res.data.error);
      toast.success('M\u00eas reaberto com sucesso!');
      onReopened();
    } catch (err) {
      toast.error(err.message || 'Erro ao reabrir o m\u00eas.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Dialog open><DialogContent><div className="p-8 text-center">Calculando impacto...</div></DialogContent></Dialog>;
  if (error) return <Dialog open onOpenChange={onClose}><DialogContent><div className="p-8 text-center text-red-500">Erro: {error.message}</div></DialogContent></Dialog>;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="font-sora sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>REABERTURA DE {monthStart.toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}/{year}</DialogTitle>
          <DialogDescription>Aten\u00e7\u00e3o: o que ser\u00e1 desfeito ao reabrir o m\u00eas:</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-3 text-sm">
            <div className="flex gap-3 items-start">
              <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <strong>{impact.receivables_to_delete} contas a receber ser\u00e3o removidas</strong>
                <div className="text-slate-500">Total: {fmt(impact.total_receivables_amount)}</div>
              </div>
            </div>

            {impact.paid_receivables_count > 0 && (
              <div className="flex gap-3 items-start text-amber-700">
                <Coins className="w-5 h-5 mt-0.5" />
                <div>
                  <strong>{impact.paid_receivables_count} est\u00e3o pagas \u2014 somando {fmt(impact.total_paid_amount)}</strong>
                  <div className="text-amber-600/80">Os lan\u00e7amentos de receita ser\u00e3o removidos e o saldo de {impact.accounts_affected_count} conta(s) ser\u00e1 recalculado.</div>
                </div>
              </div>
            )}

            <div className="flex gap-3 items-start">
              <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <strong>{impact.shifts_to_revert} plant\u00f5es voltam para "agendado"</strong>
              </div>
            </div>

            {impact.avista_shifts_preserved_count > 0 && (
              <div className="flex gap-3 items-start text-emerald-600">
                <CheckCircle2 className="w-5 h-5 mt-0.5" />
                <div>
                  <strong>Plant\u00f5es \u00e0 vista ({fmt(impact.avista_total)}) N\u00c3O ser\u00e3o afetados</strong>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Motivo da reabertura:</Label>
            <Input 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              placeholder="Ex: Esqueci de adicionar um plant\u00e3o..."
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button variant="destructive" className="flex-1" onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? 'Reabrindo...' : 'Reabrir M\u00eas'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}