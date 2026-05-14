import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addMonths, format, parseISO } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleFile = async (file) => {
    setStep('processing');
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const { data } = await base44.functions.invoke('extractInvoicePDF', {
        file_url: uploadRes.file_url,
        ref_month: refMonth,
      });

      const extracted = (data.items || []).map(item => ({
        ...item,
        _id: Math.random().toString(36),
        selected: !item.description.toLowerCase().includes('pagamento'),
        // Forçamos a exibição da data original formatada
        date_display: format(parseISO(item.date), 'dd/MM')
      }));
      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    setSaving(true);
    try {
      const allPayables = [];
      selected.forEach(it => {
        const total = it.installment_total || 1;
        const current = it.installment_number || 1;
        
        for (let i = 0; i <= (total - current); i++) {
          // A data de vencimento e competência andam conforme a parcela
          const mDate = addMonths(parseISO(refMonth + '-01'), i);
          
          allPayables.push({
            description: `${it.description} (parcela ${current + i}/${total})`.replace(' (parcela 1/1)', ''),
            amount: it.amount,
            due_date: format(mDate, 'yyyy-MM-dd') + 'T12:00:00',
            competencia: format(mDate, 'yyyy-MM-01'),
            category: it.category || 'outros',
            origin_id: card.id,
            origin_type: 'card',
            status: 'provisioned'
          });
        }
      });

      await base44.entities.Payable.bulkCreate(allPayables);
      toast.success('Importação concluída!');
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl font-sora">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="font-black uppercase text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Revisão de Maio
          </DialogTitle>
          {step === 'review' && (
            <Button variant="ghost" size="sm" onClick={() => setStep('upload')} className="text-red-500 font-black text-[10px] uppercase">
              RECOMEÇAR
            </Button>
          )}
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-20 border-2 border-dashed rounded-[2rem] text-center cursor-pointer hover:bg-slate-50" onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-slate-300 mb-4" />
            <p className="font-black text-slate-500 uppercase">Anexar Fatura de Maio</p>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="font-black text-[10px] text-slate-400 uppercase">Processando...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="border rounded-2xl overflow-hidden divide-y bg-white">
              {items.map((it) => (
                <div key={it._id} className="group flex items-center gap-3 px-4 py-3">
                  <input type="checkbox" checked={it.selected} onChange={() => {
                    setItems(items.map(x => x._id === it._id ? {...x, selected: !x.selected} : x))
                  }} className="w-4 h-4 accent-primary" />
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input 
                        className="bg-transparent border-none p-0 text-xs font-bold uppercase focus:ring-0 w-full" 
                        value={it.description} 
                        onChange={(e) => setItems(items.map(x => x._id === it._id ? {...x, description: e.target.value} : x))} 
                      />
                      {it.installment_total > 1 && (
                         <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black whitespace-nowrap">
                           {it.installment_number}/{it.installment_total}
                         </Badge>
                      )}
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">{it.date_display} • {it.category}</span>
                  </div>

                  <div className="text-right">
                    {/* Input sem setinhas (appearance-none) */}
                    <input 
                      type="text" 
                      className="w-24 bg-transparent border-none p-0 text-right text-xs font-black focus:ring-0 text-slate-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={it.amount} 
                      onChange={(e) => setItems(items.map(x => x._id === it._id ? {...x, amount: parseFloat(e.target.value) || 0} : x))} 
                    />
                  </div>
                  
                  <button onClick={() => setItems(items.filter(x => x._id !== it._id))} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button onClick={handleImport} disabled={saving} className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl">
              {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO DE MAIO'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}