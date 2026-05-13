import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, Upload, Undo2, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogAction } from '@/components/ui/alert-dialog';
import { format, startOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import ImportInvoicePDFModal from '@/components/cardInvoices/ImportInvoicePDFModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_CONFIG = {
  open:    { label: 'Aberta',   color: 'bg-blue-100 text-blue-700',       icon: Clock },
  closed:  { label: 'Fechada',  color: 'bg-amber-100 text-amber-700',     icon: AlertCircle },
  paid:    { label: 'Paga',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Vencida',  color: 'bg-red-100 text-red-700',         icon: AlertCircle },
};

export default function CardInvoices() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [payingPayable, setPayingPayable] = useState(null);
  const [importingCard, setImportingCard] = useState(null);
  const [pendingClosureCardId, setPendingClosureCardId] = useState(null); 
  const [pendingReopenData, setPendingReopenData] = useState(null);
  const [openItems, setOpenItems] = useState({});
  const queryClient = useQueryClient();

  const toggleItems = (cardId) => setOpenItems(p => ({ ...p, [cardId]: !p[cardId] }));

  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['card_invoices'], queryFn: () => base44.entities.CardInvoice.list('-month', 200) });
  const { data: payables = [] } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500) });

  const creditCards = cards.filter(c => c.type === 'credit' || c.type === 'both');
  const mStart = startOfMonth(currentMonth);
  const refMonthStr = format(mStart, 'yyyy-MM');

  const getCardItems = (cardId) => {
    return payables.filter(p => {
      if (p.origin_id !== cardId || p.origin_type !== 'card' || p.is_card_invoice_payable) return false;
      const comp = p.competencia || p.due_date;
      return comp && comp.startsWith(refMonthStr);
    });
  };

  const getInvoicePayable = (cardId) => payables.find(p => p.origin_id === cardId && p.is_card_invoice_payable === true && (p.competencia || p.due_date || '').startsWith(refMonthStr));
  const getInvoice = (cardId) => invoices.find(inv => inv.card_id === cardId && inv.month && inv.month.startsWith(refMonthStr));

  // --- MUTAÇÃO DE FECHAMENTO COM LOGS EXPLICITOS ---
  const generateMutation = useMutation({
    mutationFn: async (cardId) => {
      console.log(">>> EXECUTANDO FUNCTION generateCardInvoices PARA:", cardId);
      const res = await base44.functions.invoke('generateCardInvoices', { 
        forceCardId: cardId, 
        forceMonth: format(mStart, 'yyyy-MM') + '-01' 
      });
      console.log(">>> RESPOSTA DA API:", res);
      return res.data;
    },
    onSuccess: (data) => {
      console.log(">>> SUCESSO NO FECHAMENTO:", data);
      queryClient.invalidateQueries(); 
      setPendingClosureCardId(null);
      toast.success('Fatura fechada!'); 
    },
    onError: (err) => {
      console.error(">>> ERRO CRÍTICO NO FECHAMENTO:", err);
      toast.error('Erro ao fechar fatura');
      setPendingClosureCardId(null);
    }
  });

  const reopenInvoiceMutation = useMutation({
    mutationFn: async ({ invoice, invoicePayable }) => {
      if (invoicePayable?.id) await base44.entities.Payable.delete(invoicePayable.id);
      if (invoice?.id) await base44.entities.CardInvoice.delete(invoice.id);
    },
    onSuccess: () => { queryClient.invalidateQueries(); setPendingReopenData(null); toast.success('Reaberta!'); },
  });

  return (
    <div className="p-6 space-y-6 pb-24 font-sora text-slate-800">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Faturas de Cartão</h1>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="font-semibold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4">
        {creditCards.map(card => {
          const items = getCardItems(card.id);
          const total = items.reduce((s, p) => s + (p.amount || 0), 0);
          const invoicePayable = getInvoicePayable(card.id);
          const existingInvoice = getInvoice(card.id);
          const invoiceStatus = existingInvoice?.status || (invoicePayable?.status === 'paid' ? 'paid' : null);
          const isExpanded = !!openItems[card.id];

          return (
            <Card key={card.id} className="border-0 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-slate-100 text-primary" onClick={() => setImportingCard({ card, refMonth: refMonthStr })}>
                      <Upload className="w-4 h-4" />
                    </Button>
                    <div>
                      <CardTitle className="text-base font-bold">{card.name}</CardTitle>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.bank || 'CARTÃO'}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-xl font-black text-red-600">{fmt(total)}</p>
                    {invoiceStatus ? (
                      <Badge className={`text-[10px] font-bold uppercase border-0 ${STATUS_CONFIG[invoiceStatus]?.color}`}>{STATUS_CONFIG[invoiceStatus]?.label}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-bold uppercase">Pendente</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <Collapsible open={isExpanded} onOpenChange={() => toggleItems(card.id)}>
                  <div className="px-5 py-3 flex items-center justify-between bg-slate-50/50 border-y">
                    <div className="flex gap-4 text-[11px] text-slate-500 font-bold uppercase">
                      <span>Fecha: {card.closing_day || '-'}</span>
                      <span>Vence: {card.due_day || '-'}</span>
                      <span>{items.length} itens</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!invoicePayable && items.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-primary" onClick={() => {
                          console.log("Botão FECHAR clicado para o cartão:", card.id);
                          setPendingClosureCardId(card.id);
                        }}>
                          FECHAR FATURA
                        </Button>
                      )}
                      {invoicePayable && invoicePayable.status !== 'paid' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-amber-600" onClick={() => setPendingReopenData({ invoice: existingInvoice, invoicePayable })}>
                            <Undo2 className="w-3 h-3 mr-1" /> REABRIR
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-emerald-600" onClick={() => setPayingPayable(invoicePayable)}>
                            PAGAR AGORA
                          </Button>
                        </>
                      )}
                      <CollapsibleTrigger asChild>
                        <Button variant="link" size="sm" className="h-8 text-[11px] font-bold no-underline">{isExpanded ? 'OCULTAR' : 'VER LANÇAMENTOS'}</Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  {/* Conteúdo da lista omitido por brevidade, mas deve ser mantido conforme versão anterior */}
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* MODAL DE FECHAMENTO COM DISPARO MANUAL SEGURO */}
      <AlertDialog open={!!pendingClosureCardId} onOpenChange={() => setPendingClosureCardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar fatura?</AlertDialogTitle>
            <AlertDialogDescription>Deseja consolidar esses gastos em um lançamento único?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 mt-4">
            <AlertDialogCancel className="flex-1">CANCELAR</AlertDialogCancel>
            <Button 
              className="flex-1 bg-primary text-white font-bold" 
              onClick={() => {
                console.log("Confirmado no modal. Chamando mutate para:", pendingClosureCardId);
                generateMutation.mutate(pendingClosureCardId);
              }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? 'PROCESSANDO...' : 'FECHAR AGORA'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Outros modais (Reabrir, Pagar, Importar) devem ser mantidos aqui conforme o código original */}
      {payingPayable && <ConfirmPayableModal payable={payingPayable} onClose={() => { setPayingPayable(null); queryClient.invalidateQueries(); }} />}
      {importingCard && <ImportInvoicePDFModal card={importingCard.card} refMonth={importingCard.refMonth} onClose={() => setImportingCard(null)} onImported={() => queryClient.invalidateQueries()} />}
      {pendingReopenData && (
        <AlertDialog open onOpenChange={() => setPendingReopenData(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Reabrir fatura?</AlertDialogTitle></AlertDialogHeader>
            <div className="flex gap-2 p-4">
              <AlertDialogCancel className="flex-1">CANCELAR</AlertDialogCancel>
              <Button variant="destructive" className="flex-1 font-bold" onClick={() => reopenInvoiceMutation.mutate(pendingReopenData)}>REABRIR</Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}