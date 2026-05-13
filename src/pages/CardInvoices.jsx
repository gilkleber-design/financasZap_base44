import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, RefreshCw, Pencil, Upload, Undo2, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, startOfMonth, addMonths, subMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditInvoiceItemsModal from '@/components/cardInvoices/EditInvoiceItemsModal';
import ImportInvoicePDFModal from '@/components/cardInvoices/ImportInvoicePDFModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_CONFIG = {
  open:    { label: 'Aberta',   color: 'bg-blue-100 text-blue-700',       icon: Clock },
  closed:  { label: 'Fechada',  color: 'bg-amber-100 text-amber-700',     icon: AlertCircle },
  paid:    { label: 'Paga',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Vencida',  color: 'bg-red-100 text-red-700',         icon: AlertCircle },
};

// Helper para pegar logo do banco automaticamente
const getBankLogo = (bankName) => {
  if (!bankName) return null;
  const name = bankName.toLowerCase();
  if (name.includes('itau')) return 'https://logo.clearbit.com/itau.com.br';
  if (name.includes('bradesco')) return 'https://logo.clearbit.com/bradesco.com.br';
  if (name.includes('nubank')) return 'https://logo.clearbit.com/nubank.com.br';
  if (name.includes('santander')) return 'https://logo.clearbit.com/santander.com.br';
  if (name.includes('inter')) return 'https://logo.clearbit.com/bancointer.com.br';
  if (name.includes('btg')) return 'https://logo.clearbit.com/btgpactual.com';
  if (name.includes('caixa')) return 'https://logo.clearbit.com/caixa.gov.br';
  if (name.includes('brasil') || name.includes('bb')) return 'https://logo.clearbit.com/bb.com.br';
  return null;
};

export default function CardInvoices() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [payingPayable, setPayingPayable] = useState(null);
  const [editingInvoiceItems, setEditingInvoiceItems] = useState(null);
  const [importingCard, setImportingCard] = useState(null);
  const [reopeningInvoice, setReopeningInvoice] = useState(null);
  const [openItems, setOpenItems] = useState({});
  const queryClient = useQueryClient();

  const toggleItems = (cardId) => setOpenItems(p => ({ ...p, [cardId]: !p[cardId] }));

  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
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

  const generateMutation = useMutation({
    mutationFn: async (cardId) => base44.functions.invoke('generateCardInvoices', { forceCardId: cardId, forceMonth: format(mStart, 'yyyy-MM') + '-01' }),
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Fatura fechada!'); },
  });

  const reopenInvoiceMutation = useMutation({
    mutationFn: async ({ invoice, invoicePayable }) => {
      if (invoicePayable?.id) await base44.entities.Payable.delete(invoicePayable.id);
      if (invoice?.id) await base44.entities.CardInvoice.delete(invoice.id);
    },
    onSuccess: () => { queryClient.invalidateQueries(); setReopeningInvoice(null); toast.success('Fatura reaberta!'); },
  });

  return (
    <div className="p-6 space-y-6 pb-24 font-sora">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Faturas de Cartão</h1>
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
          const isExpanded = openItems[card.id];
          const bankLogo = getBankLogo(card.bank);

          return (
            <Card key={card.id} className="border-0 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Botão Importar (Símbolo apenas) à esquerda da logo */}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-full bg-slate-100 hover:bg-primary/10 text-primary transition-colors"
                      onClick={() => setImportingCard({ card, refMonth: refMonthStr })}
                    >
                      <Upload className="w-4 h-4" />
                    </Button>

                    {/* Logo do Banco + Nome do Cartão */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-white overflow-hidden shrink-0">
                        {bankLogo ? (
                          <img src={bankLogo} alt={card.bank} className="w-7 h-7 object-contain" />
                        ) : (
                          <CreditCard className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">{card.name}</CardTitle>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.bank || 'CARTÃO'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-xl font-black text-red-600">{fmt(total)}</p>
                    {invoiceStatus ? (
                      <Badge className={`text-[10px] font-bold uppercase border-0 ${STATUS_CONFIG[invoiceStatus]?.color}`}>
                        {STATUS_CONFIG[invoiceStatus]?.label}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-bold uppercase">Sem fatura</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <Collapsible open={isExpanded} onOpenChange={() => toggleItems(card.id)}>
                  <div className="px-5 py-3 flex items-center justify-between bg-slate-50/50 border-y">
                    <div className="flex gap-4 text-[11px] text-slate-500 font-bold uppercase tracking-tight">
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Fecha: {card.closing_day || '-'}</span>
                      <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Vence: {card.due_day || '-'}</span>
                      <span className="flex items-center gap-1.5"><ListFilter className="w-3.5 h-3.5" /> {items.length} itens</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Ações rápidas */}
                      {!invoicePayable && items.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-primary" onClick={() => generateMutation.mutate(card.id)}>
                          FECHAR FATURA
                        </Button>
                      )}
                      {invoicePayable && invoicePayable.status !== 'paid' && (
                        <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-emerald-600" onClick={() => setPayingPayable(invoicePayable)}>
                          PAGAR AGORA
                        </Button>
                      )}

                      <CollapsibleTrigger asChild>
                        <Button variant="link" size="sm" className="h-8 text-[11px] font-bold no-underline">
                          {isExpanded ? 'OCULTAR' : 'VER LANÇAMENTOS'}
                          {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <CollapsibleContent className="bg-slate-50/20">
                    <div className="p-4 space-y-3">
                      {items.length > 0 ? (
                        <div className="bg-white rounded-xl border shadow-sm divide-y overflow-hidden">
                          {items.map(p => (
                            <div key={p.id} className="flex items-center justify-between px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.description}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">
                                  {format(new Date((p.purchase_date || p.due_date).includes('T') ? (p.purchase_date || p.due_date) : (p.purchase_date || p.due_date) + 'T12:00:00'), 'dd/MM/yy')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-slate-900">{fmt(p.amount)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center py-8 text-xs text-slate-400 font-medium uppercase tracking-widest">Nenhum lançamento</p>
                      )}
                      
                      {invoicePayable && (
                        <div className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Status Consolidado</p>
                            <p className="text-sm font-bold text-slate-700">{invoicePayable.description}</p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            {invoicePayable.status !== 'paid' && (
                              <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold text-amber-600 border-amber-200" onClick={() => setReopeningInvoice({ invoice: existingInvoice, invoicePayable })}>
                                <Undo2 className="w-3 h-3 mr-1" /> REABRIR
                              </Button>
                            )}
                            <p className="text-lg font-black text-slate-900">{fmt(invoicePayable.amount)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modais mantidos conforme original */}
      {payingPayable && <ConfirmPayableModal payable={payingPayable} onClose={() => { setPayingPayable(null); queryClient.invalidateQueries(); }} />}
      {editingInvoiceItems && <EditInvoiceItemsModal items={editingInvoiceItems} onClose={() => setEditingInvoiceItems(null)} onSaved={() => queryClient.invalidateQueries()} />}
      {importingCard && <ImportInvoicePDFModal card={importingCard.card} refMonth={importingCard.refMonth} onClose={() => setImportingCard(null)} onImported={() => { queryClient.invalidateQueries(); setImportingCard(null); }} />}
      
      {reopeningInvoice && (
        <AlertDialog open onOpenChange={() => setReopeningInvoice(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Reabrir fatura?</AlertDialogTitle></AlertDialogHeader>
            <div className="flex gap-2 p-4">
              <AlertDialogCancel className="flex-1">CANCELAR</AlertDialogCancel>
              <Button variant="destructive" className="flex-1 font-bold" onClick={() => reopenInvoiceMutation.mutate(reopeningInvoice)}>REABRIR AGORA</Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}