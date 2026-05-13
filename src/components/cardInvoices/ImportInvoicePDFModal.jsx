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
      
      const bankTotal = result.integrity_check?.invoice_total || 0;
      setInvoiceTotalFromBank(bankTotal);

      const closingDate = parseISO(`${refMonth.substring(0, 7)}-${cardClosingDay.toString().padStart(2, '0')}`);

      let extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        const isCredit = item.amount < 0 || desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls') || desc.includes('pagamento efetuado');
        
        let finalAmount = Math.abs(item.amount || 0);
        if (isCredit) finalAmount = -Math.abs(finalAmount);

        let isAfterClosing = false;
        let displayDate = item.date || '';
        let sortDate = item.date ? parseISO(item.date) : new Date(0);

        if (item.date) {
            const itemDate = parseISO(item.date);
            if (isValid(itemDate)) {
                isAfterClosing = isAfter(itemDate, closingDate) || isEqual(itemDate, closingDate);
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
          selected: !isAfterClosing, 
          is_future: isAfterClosing,
          is_credit: isCredit
        };
      });

      extracted.sort((a, b) => compareAsc(a.sort_date, b.sort_date));

      // --- A CAMADA DE REPARO CONTÁBIL ---
      // 1. Calculamos quanto dá a soma inicial (apenas itens válidos do mês)
      const initialTotal = extracted
        .filter(it => !it.is_future)
        .reduce((acc, it) => acc + (it.amount || 0), 0);
      
      // 2. Se a IA sumiu com estornos, a soma do app será MAIOR que a do banco.
      // Precisamos injetar um item negativo (crédito) para compensar a falha da IA.
      const lostCreditsDiff = initialTotal - bankTotal;

      if (lostCreditsDiff > 1) { // Se a diferença for maior que R$ 1,00
          extracted.unshift({
             _id: 'ajuste-ia',
             description: 'ESTORNOS E CANCELAMENTOS NÃO DETECTADOS PELA IA',
             amount: -Math.abs(lostCreditsDiff),
             date_display: 'Ajuste',
             sort_date: new Date(0), // Fica no topo da lista
             selected: true,
             is_future: false,
             is_credit: true,
             category: 'outros',
             is_adjustment: true
          });
      }

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
    const { addMonths } = await import('date-fns');
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Nenhum item selecionado');

    setSaving(true);

    try {
      const payables = selected.map(it => ({
          description: it.is_adjustment ? it.description : it.description + (it.is_credit && !it.is_adjustment ? ' [ESTORNO]' : ''),
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
      toast.success('Fatura importada com sucesso!');
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
            Conciliação de Fatura — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-10 flex flex-col items-center gap-6">
             <div className="w-full border-2 border-dashed border-slate-200 rounded-[2rem] p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 transition-all" onClick={() => fileRef.current?.click()}>
               <Upload className="w-10 h-10 text-slate-300" />
               <p className="text-sm font-black text-slate-500 uppercase tracking-tighter">Subir PDF da Fatura</p>
             </div>
             <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Varrendo arquivo PDF e reparando falhas...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex gap-3 items-center ${diffWithBank < 0.1 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              {diffWithBank < 0.1 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <p className={`text-[11px] font-black uppercase ${diffWithBank < 0.1 ? 'text-emerald-700' : 'text-red-700'}`}>
                {diffWithBank < 0.1 ? 'Conciliação Automática Efetuada' : `Diferença Residual: ${fmt(diffWithBank)}`}
              </p>
            </div>

            <div className="divide-y border rounded-2xl bg-white overflow-hidden shadow-sm">
              {items.map((it, idx) => (
                <div key={it._id} className={`flex items-center gap-4 px-4 py-3 ${it.selected ? 'bg-white' : 'bg-slate-50 opacity-40'} ${it.is_adjustment ? 'bg-emerald-50/50' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={it.selected} 
                    onChange={() => setItems(prev => prev.map((item, i) => i === idx ? {...item, selected: !item.selected} : item))} 
                    className="w-4 h-4 accent-primary" 
                    disabled={it.is_adjustment}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold uppercase truncate ${it.is_credit ? 'text-emerald-600' : 'text-slate-700'} ${it.is_adjustment ? 'text-emerald-700' : ''}`}>
                         {it.description}
                      </p>
                      {it.is_future && <Badge className="bg-slate-200 text-slate-600 text-[7px] font-black border-none h-3.5 uppercase">Próx. Mês</Badge>}
                      {it.is_adjustment && <Badge className="bg-emerald-100 text-emerald-700 text-[7px] font-black border-none h-3.5 uppercase">Ajuste de IA</Badge>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{it.date_display} • {it.category}</p>
                  </div>
                  <span className={`text-xs font-black min-w-[90px] text-right ${it.is_credit ? 'text-emerald-600' : 'text-red-600'}`}>
                    {it.is_credit ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Total no Banco</p>
                    <p className="text-lg font-black text-slate-400">{fmt(invoiceTotalFromBank)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Total Sincronizado</p>
                    <p className={`text-2xl font-black ${diffWithBank < 0.1 ? 'text-emerald-400' : 'text-white'}`}>{fmt(selectedTotal)}</p>
                  </div>
               </div>
               <Button className="w-full mt-5 h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl transition-all" onClick={handleImport} disabled={saving}>
                  {saving ? 'PROCESSANDO...' : 'CONFIRMAR E IMPORTAR'}
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}