import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UserCheck, Trash2, AlertTriangle, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const kindLabel = { regular: 'Regular', extra: 'Extra', sobreaviso: 'Sobreaviso' };
const kindColor = {
  regular: 'bg-blue-100 text-blue-700 border-blue-200',
  extra: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  sobreaviso: 'bg-red-100 text-red-700 border-red-200',
};
const statusLabel = {
  scheduled: 'Agendado',
  done: 'Realizado',
  cancelled: '🩶 Cancelado',
  passed: '🩶 Passado',
};

export default function ShiftDetailModal({ shift, hospital, source, onClose, onPass, onDeleteScope, onEdit, onUpdateStatus }) {
  const [view, setView] = useState('detail');
  const [passedTo, setPassedTo] = useState('');
  const [passedDate, setPassedDate] = useState(shift.date);
  const [passedNotes, setPassedNotes] = useState('');

  const handlePass = () => {
    if (!passedTo.trim()) return;
    onPass(shift.id, { passed_to: passedTo, passed_date: passedDate, passed_notes: passedNotes, status: 'passed' });
  };

  const taxRate = source?.default_tax_rate || 0;
  const bruto = shift.valor || 0;
  const liquido = taxRate > 0 ? bruto * (1 - taxRate / 100) : bruto;

  const dateFormatted = format(new Date(shift.date + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  if (view === 'pass') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-purple-500" />
              Passei este plantão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground capitalize">{dateFormatted} — {hospital?.sigla} {shift.type}</p>
            <div>
              <Label>Pra quem passou? *</Label>
              <Input className="mt-1" placeholder="Nome do colega..." value={passedTo} onChange={e => setPassedTo(e.target.value)} />
            </div>
            <div>
              <Label>Data do passe</Label>
              <Input type="date" className="mt-1" value={passedDate} onChange={e => setPassedDate(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1 resize-none" rows={3} placeholder="Ex: combinamos trocar no dia X, valor X..." value={passedNotes} onChange={e => setPassedNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView('detail')} className="flex-1">Voltar</Button>
            <Button onClick={handlePass} disabled={!passedTo.trim()} className="flex-1 bg-purple-600 hover:bg-purple-700">
              Confirmar Passe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (view === 'delete_confirm') {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Deletar plantão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Como deseja deletar este plantão?
            </p>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Apenas plantões <strong>ainda não fechados</strong> serão removidos. Contas a receber já geradas continuam intactas.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => onDeleteScope(shift, 'only_this')} className="w-full justify-start font-medium text-foreground">Apenas esse</Button>
            <Button variant="outline" onClick={() => onDeleteScope(shift, 'from_here')} className="w-full justify-start font-medium text-foreground">Daqui pra frente</Button>
            <Button variant="outline" onClick={() => onDeleteScope(shift, 'all')} className="w-full justify-start font-medium text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20">Todos</Button>
            <Button variant="ghost" onClick={() => setView('detail')} className="w-full mt-2">Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="capitalize">{dateFormatted}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="bg-muted/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-base">{hospital?.sigla} — {hospital?.name}</span>
              <div className="flex items-center gap-1">
                {shift.is_turno && (
                  <Badge className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200">
                    Turno
                  </Badge>
                )}
                <Badge className={`text-xs border ${kindColor[shift.shift_kind] || 'bg-gray-100 text-gray-600'}`}>
                  {shift.type} {kindLabel[shift.shift_kind] || shift.shift_kind}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-sm font-medium">{statusLabel[shift.status] || shift.status}</span>
            </div>
            {/* Valor líquido em destaque */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor líquido</span>
              <span className="text-sm font-semibold text-emerald-600">{fmt(liquido)}</span>
            </div>
            {/* Valor bruto se há imposto */}
            {taxRate > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Bruto ({taxRate}% imposto)</span>
                <span className="text-xs text-muted-foreground">{fmt(bruto)}</span>
              </div>
            )}
            {hospital?.remuneration_model === 'producao' && (
              <div className="text-xs text-purple-600 bg-purple-50 rounded-lg px-2 py-1">Modelo: Produção por evento</div>
            )}
            {shift.notes && (
              <div className="text-xs text-muted-foreground pt-1 border-t border-border">{shift.notes}</div>
            )}
          </div>

          {shift.status === 'passed' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-purple-700">Plantão passado para:</p>
              <p className="text-sm font-medium text-purple-800">{shift.passed_to}</p>
              {shift.passed_date && (
                <p className="text-xs text-purple-600">Data: {format(new Date(shift.passed_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
              )}
              {shift.passed_notes && (
                <p className="text-xs text-purple-600 italic">"{shift.passed_notes}"</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {shift.status === 'scheduled' && (
            <>
              <Button 
                onClick={() => onUpdateStatus(shift.id, 'done')} 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Realizado
              </Button>
              <Button onClick={() => setView('pass')} className="w-full bg-purple-600 hover:bg-purple-700">
                <UserCheck className="w-4 h-4 mr-2" />
                Passei
              </Button>
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(shift.id, 'cancelled')}
                className="w-full text-slate-600 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => onEdit(shift)}
                className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border-blue-200"
              >
                Editar
              </Button>
              <Button
                variant="outline"
                onClick={() => setView('delete_confirm')}
                className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar
              </Button>
            </>
          )}
          {shift.status === 'done' && (
            <>
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(shift.id, 'scheduled')}
                className="w-full bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 border-amber-200"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Desfazer Realizado
              </Button>
              <Button
                variant="outline"
                onClick={() => onEdit(shift)}
                className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border-blue-200"
              >
                Editar
              </Button>
              <Button
                variant="outline"
                onClick={() => setView('delete_confirm')}
                className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar
              </Button>
            </>
          )}
          {shift.status === 'cancelled' && (
            <>
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(shift.id, 'scheduled')}
                className="w-full bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 border-amber-200"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Desfazer Cancelamento
              </Button>
              <Button
                variant="outline"
                onClick={() => onEdit(shift)}
                className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border-blue-200"
              >
                Editar
              </Button>
              <Button
                variant="outline"
                onClick={() => setView('delete_confirm')}
                className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar
              </Button>
            </>
          )}
          {shift.status === 'passed' && (
            <>
              <Button
                variant="outline"
                onClick={() => onUpdateStatus(shift.id, 'scheduled', { passed_to: null, passed_date: null, passed_notes: null })}
                className="w-full bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 border-amber-200"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Desfazer Passe
              </Button>
              <Button
                variant="outline"
                onClick={() => onEdit(shift)}
                className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 border-blue-200"
              >
                Editar
              </Button>
              <Button
                variant="outline"
                onClick={() => setView('delete_confirm')}
                className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose} className="w-full">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}