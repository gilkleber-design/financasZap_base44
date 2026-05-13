import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { isAfter, parseISO, isValid, isEqual, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [invoiceTotalFromBank, setInvoiceTotalFromBank] = useState(0);

  // Lógica de Trava: Usa o dia de fechamento cadastrado no cartão
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

      // Define a data limite de fechamento baseada no cadastro do cartão
      const closingDate = parseISO(`${refMonth.substring(0, 7)}-${cardClosingDay.toString().padStart(2, '0')}`);

      const extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        
        // 1. Normalização de Sinais (Estornos e Pagamentos)
        const isNegativeText = desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls') || desc.includes('pagamento efetuado');
        let finalAmount = Math.abs(item.amount || 0);
        if (item.amount < 0 || isNegativeText) finalAmount = -Math.abs(finalAmount);

        // 2. Trava Automática de Fechamento
        let isAfterClosing = false;
        let displayDate = item.date;

        if (item.date) {
            const itemDate = parseISO(item.date);
            if (isValid(itemDate)) {
                isAfterClosing = isAfter(itemDate, closingDate) || isEqual(itemDate, closingDate);
                // Formata para o padrão Brasileiro DD/MM/AAAA
                displayDate = format(itemDate, 'dd/MM/yyyy');
            }
        }

        return {
          ...item,
          amount: finalAmount,
          date_display: displayDate,
          _id: i,
          selected: !isAfterClosing, 
          is_future: isAfterClosing
        };
      });

      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro ao processar PDF');
      setStep('upload');
    }
  };

  const selectedTotal = useMemo(() => {
    return items.filter(it => it.selected).reduce((s, it) => s + (it.amount || 0), 0);
  }, [items]);

  const diffWithBank = Math.abs(selectedTotal - invoiceTotalFromBank);

  const handleImport = async () => {
    setSaving(true);
    // Aqui segue sua lógica de bulkCreate para o banco...
    toast.success('Lançamentos importados!');
    setSaving(false);
    onImported();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 font-black uppercase tracking-tight">
            <FileText className="w-5 h-5 text-primary" />
            Conciliação de Fatura — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-10 flex flex-col items-center gap-6">
             <div className="text-center">
                <Badge variant="outline" className="mb-2 border-primary/20 text-primary">
                   Fechamento: Dia {cardClosingDay}
                </Badge>
                <p className="text-[10px] text-slate-400 font-bold uppercase">A trava de data será aplicada automaticamente</p>
             </div>
             <div 
               className="w-full border-2 border-dashed border-slate-200 rounded-[2rem] p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 transition-all" 
               onClick={() => fileRef.current?.click()}
             >
               <Upload className="w-10 h-10 text-slate-300" />
               <p className="text-sm font-black text-slate-500 uppercase">Carregar Fatura PDF</p>
             </div>
             <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Processando e formatando datas...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex gap-3 items-center ${diffWithBank < 0.1 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              {diffWithBank < 0.1 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
              <p className={`text-[11px] font-black uppercase ${diffWithBank < 0.1 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {diffWithBank < 0.1 ? 'Valores em conformidade com o banco' : `Diferença detectada: ${fmt(diffWithBank)}`}
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
                      <p className={`text-xs font-bold uppercase truncate ${it.amount < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{it.description}</p>
                      {it.is_future && <Badge className="bg-slate-100 text-slate-500 text-[7px] font-black border-none h-3.5">PRÓX. FATURA</Badge>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase">{it.date_display} • {it.category}</p>
                  </div>
                  <span className={`text-xs font-black min-w-[90px] text-right ${it.amount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {it.amount < 0 ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500">Total do PDF</p>
                    <p className="text-lg font-black text-slate-300">{fmt(invoiceTotalFromBank)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-slate-500">Selecionado para Importação</p>
                    <p className={`text-2xl font-black ${diffWithBank < 0.1 ? 'text-emerald-400' : 'text-white'}`}>{fmt(selectedTotal)}</p>
                  </div>
               </div>
               <Button className="w-full mt-5 h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl" onClick={handleImport} disabled={saving}>
                  {saving ? 'PROCESSANDO...' : 'CONFIRMAR E IMPORTAR'}
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}