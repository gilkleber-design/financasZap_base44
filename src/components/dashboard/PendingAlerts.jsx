import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import ConfirmReceivableModal from './ConfirmReceivableModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PendingAlerts({ payables, receivables }) {
  const [confirmingReceivable, setConfirmingReceivable] = useState(null);

  const allAlerts = [
    ...payables.map(p => ({ ...p, alertType: 'payable', label: 'A Pagar' })),
    ...receivables.map(r => ({ ...r, alertType: 'receivable', label: 'A Receber' })),
  ].sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 8);

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Alertas Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allAlerts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum pendente 🎉</p>
          )}
          {allAlerts.map(item => {
            const overdue = item.due_date && isPast(new Date(item.due_date)) && !isToday(new Date(item.due_date));
            const isReceivable = item.alertType === 'receivable';
            return (
              <div key={item.id} className={`p-3 rounded-lg border text-sm ${overdue ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.description}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        {item.due_date ? format(new Date(item.due_date), 'dd/MM', { locale: ptBR }) : '—'}
                        {overdue && ' · Vencido'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className={`font-semibold text-xs ${isReceivable ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isReceivable ? '+' : '-'}{fmt(item.net_amount || item.amount)}
                    </p>
                    <Badge variant="outline" className="text-xs">{item.label}</Badge>
                    {isReceivable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50 mt-0.5"
                        onClick={() => setConfirmingReceivable(item)}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Recebido
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {confirmingReceivable && (
        <ConfirmReceivableModal
          receivable={confirmingReceivable}
          onClose={() => setConfirmingReceivable(null)}
        />
      )}
    </>
  );
}