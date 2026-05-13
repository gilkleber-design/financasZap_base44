import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { isAfter, parseISO, isValid, isEqual, format, compareAsc } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [invoiceTotalFromBank, setInvoiceTotalFromBank] = useState(0);

  // Trava baseada no cadastro do cartão (ex: dia 5)
  const cardClosingDay = card.closing_day || 5; 

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') return toast.error('Selecione um arquivo PDF');
    setStep('processing');

    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('extractInvoicePDF', {
        file_url: uploadRes.file_url,
        ref_month: refMonth,
      });

      const result = response.data;
      if (!result?.items) throw new Error('IA não retornou dados.');
      
      setInvoiceTotalFromBank(result.integrity_check?.invoice_total || 0);

      const closingDate = parseISO(`${refMonth.substring(0, 7)}-${cardClosingDay.toString().padStart(2, '0')}`);

      let extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        
        // 1. Identifica se é PAGAMENTO (Recibo da fatura anterior)
        const isPayment = desc.includes('pagamento');

        // 2. Identifica se é ESTORNO/CRÉDITO (Exclui o pagamento desta regra)
        const isCredit = !isPayment && (item.amount < 0 || desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('cance lamento') || desc.includes('est pcls'));
        
        // Normalização para o cálculo matemático
        let finalAmount = Math.abs(item.amount || 0);
        if (isCredit || isPayment) finalAmount = -Math.abs(finalAmount);

        let isAfterClosing = false;
        let displayDate = item.date || '';
        let sortDate = item.date ? parseISO(item.date) : new Date(0);

        if (item.date) {
            const itemDate = parseISO(item.date);
            if (isValid(itemDate)) {
                // Aplica trava de fechamento
                isAfterClosing = isAfter(itemDate, closingDate) || isEqual(itemDate, closingDate);
                // Formatação Brasileira
                displayDate = format(itemDate, 'dd/MM/yyyy');
                sortDate = itemDate;
            }
        }

        return {
          ...item,
          amount: finalAmount,
          date_display: displayDate,
          sort_date: sortDate,
          _id: i,
          // REGRA: Ignora o pagamento anterior e gastos futuros na seleção inicial
          selected: !isAfterClosing && !isPayment, 
          is_future: isAfterClosing,
          is_credit: isCredit,
          is_payment: isPayment
        };
      });

      // ORDENAÇÃO POR DATA DE COMPRA (CRESCENTE)
      extracted.sort((a, b) => compareAsc(a.sort_date, b.sort_date));

      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  const selectedTotal = useMemo(() => {
    return items
      .filter(it => it.selected)
      .reduce((acc, it) => acc + (it.amount || 0), 0);
  }, [items]);

  const diffWithBank = Math.abs(selectedTotal - invoiceTotalFromBank);

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Selecione itens');
    setSaving(true);

    try {
      const payables = selected.map(it => ({
          description: it.description + (it.is_credit ? ' [ESTORNO]' : ''),
          amount: it.amount, 
          due_date: (it.date || refMonth + '-01') + 'T12:00:00',
          competencia: refMonth + '-01',
          category: it.category || 'outros',
          status: 'provisioned',
          origin_id: card.id,
          origin_type: 'card',
          payment_modality: 'card_invoice',
      }));

      await base44.entities.Payable.bulkCreate(payables);
      toast.success('Lançamentos importados!');
      setSaving(false);
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-slate-800">
            <FileText className="w-5 h-5 text-primary" />
            Conferência de Lançamentos — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-10 flex flex-col items-center gap-6">
             <div className="w-full border-2 border-dashed border-slate-200 rounded-[2rem] p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 transition-all" onClick={() => fileRef.current?.click()}>
               <Upload className="w-10 h-10 text-slate-300" />
               <p className="text-sm font-black text-slate-500 uppercase">Anexar PDF da Fatura</p>
             </div>
             <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ordenando cronologicamente e filtrando pagamentos...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex gap-3 items-center ${diffWithBank < 0.1 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              {diffWithBank < 0.1 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <p className={`text-[11px] font-black uppercase ${diffWithBank < 0.1 ? 'text-emerald-700' : 'text-red-700'}`}>
                {diffWithBank < 0.1 ? 'Fatura Conciliada' : `Divergência: ${fmt(diffWithBank)}`}
              </p>
            </div>

            <div className="divide-y border rounded-2xl bg-white overflow-hidden shadow-sm">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-4 px-4 py-3 ${it.selected ? 'bg-white' : 'bg-slate-50 opacity-40'}`}>
                  <input 
                    type="checkbox" 
                    checked={it.selected} 
                    onChange={() => setItems(prev => prev.map((item, i) => i === idx ? {...item, selected: !item.selected} : item))} 
                    className="w-4 h-4 accent-primary" 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold uppercase truncate ${it.is_credit ? 'text-emerald-600' : it.is_payment ? 'text-blue-600' : 'text-slate-700'}`}>
                         {it.description}
                      </p>
                      {it.is_future && <Badge className="bg-slate-200 text-slate-600 text-[7px] font-black border-none h-3.5 uppercase">Futuro</Badge>}
                      {it.is_credit && <Badge className="bg-emerald-100 text-emerald-700 text-[7px] font-black border-none h-3.5 uppercase">Estorno</Badge>}
                      {it.is_payment && <Badge className="bg-blue-100 text-blue-700 text-[7px] font-black border-none h-3.5 uppercase">Pagto Anterior</Badge>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase">{it.date_display} • {it.category}</p>
                  </div>
                  <span className={`text-xs font-black min-w-[90px] text-right ${it.is_credit || it.is_payment ? 'text-emerald-600' : 'text-red-600'}`}>
                    {it.is_credit || it.is_payment ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500">Total PDF</p>
                    <p className="text-lg font-black text-slate-400">{fmt(invoiceTotalFromBank)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-slate-500">Total Selecionado</p>
                    <p className={`text-2xl font-black ${diffWithBank < 0.1 ? 'text-emerald-400' : 'text-white'}`}>{fmt(selectedTotal)}</p>
                  </div>
               </div>
               <Button className="w-full mt-5 h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl transition-all" onClick={handleImport} disabled={saving}>
                  {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}