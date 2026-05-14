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
        date_display: format(parseISO(item.date), 'dd/MM')
      }));
      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  // --- FUNÇÕES DE EXCLUSÃO ---
  const deleteItem = (id) => {
    setItems(prev => prev.filter(it => it._id !== id));
  };

  const clearInvoice = () => {
    setItems([]);
    setStep('upload');
    toast.info('Fatura descartada');
  };

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Nenhum item selecionado');
    setSaving(true);
    try {
      const allPayables = [];
      selected.forEach(it => {
        const total = it.installment_total || 1;
        const current = it.installment_number || 1;
        
        for (let i = 0; i <= (total - current); i++) {
          const mDate = addMonths(parseISO(refMonth + '-01'), i);
          allPayables.push({
            description: `${it.description} ${total > 1 ? `(parcela ${current + i}/${total})` : ''}`.trim(),
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
      toast.success('Lançamentos importados com sucesso!');
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar');
      setSaving(false);
    }
  };

  const totalSelected = useMemo(() => items.filter(it => it.selected).reduce((acc, it) => acc + it.amount, 0), [items]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl font-sora">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="font-black uppercase text-slate-800 flex items-center gap-2 text-sm">
            <FileText className="w-5 h-5 text-primary" /> Fatura: {refMonth}
          </DialogTitle>
          {step === 'review' && (
            <Button variant="ghost" size="sm" onClick={clearInvoice} className="text-red-500 font-black text-[10px] uppercase flex items-center gap-1 hover:bg-red-50 px-3">
              <Trash2 className="w-3.5 h-3.5" /> Deletar Fatura
            </Button>
          )}
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-20 border-2 border-dashed rounded-[2rem] text-center cursor-pointer hover:bg-slate-50" onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-black text-slate-500 uppercase">Anexar PDF da Fatura</p>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="font-black text-[10px] text-slate-400 uppercase">Processando dados...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="border rounded-2xl overflow-hidden divide-y bg-white max-h-[50vh] overflow-y-auto shadow-sm">
              {items.map((it) => (
                <div key={it._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <input type="checkbox" checked={it.selected} onChange={() => {
                    setItems(items.map(x => x._id === it._id ? {...x, selected: !x.selected} : x))
                  }} className="w-4 h-4 accent-primary" />
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input 
                        className="bg-transparent border-none p-0 text-xs font-bold uppercase focus:ring-0 w-full text-slate-700" 
                        value={it.description} 
                        onChange={(e) => setItems(items.map(x => x._id === it._id ? {...x, description: e.target.value} : x))} 
                      />
                      {it.installment_total > 1 && (
                         <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black h-5">
                           {it.installment_number}/{it.installment_total}
                         </Badge>
                      )}
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">{it.date_display} • {it.category}</span>
                  </div>

                  {/* Valor sem setas de número */}
                  <input 
                    type="text" 
                    className="w-20 bg-transparent border-none p-0 text-right text-xs font-black focus:ring-0 text-slate-700"
                    value={it.amount} 
                    onChange={(e) => setItems(items.map(x => x._id === it._id ? {...x, amount: parseFloat(e.target.value) || 0} : x))} 
                  />

                  {/* Lixo individual sempre visível */}
                  <button onClick={() => deleteItem(it._id)} className="text-slate-300 hover:text-red-500 p-2 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] flex justify-between items-center text-white">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase">Total Selecionado</p>
                <p className="text-2xl font-black">{fmt(totalSelected)}</p>
              </div>
              <Button onClick={handleImport} disabled={saving} className="h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl px-8">
                {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}