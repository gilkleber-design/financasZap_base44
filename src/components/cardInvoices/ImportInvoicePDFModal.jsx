import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Calendar, X } from 'lucide-react';
import { toast } from 'sonner';
import { isAfter, parseISO, isValid, isEqual, format, addMonths } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [invoiceTotalFromBank, setInvoiceTotalFromBank] = useState(0);

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
      setInvoiceTotalFromBank(result.integrity_check?.invoice_total || 0);

      const extracted = (result.items || []).map((item, i) => {
        const isPayment = item.description.toLowerCase().includes('pagamento');
        return {
          ...item,
          _id: Math.random().toString(36),
          selected: !isPayment,
          is_payment: isPayment,
          date_display: item.date ? format(parseISO(item.date), 'dd/MM/yyyy') : ''
        };
      });
      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(it => it._id === id ? { ...it, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : it));
  };

  const deleteItem = (id) => setItems(prev => prev.filter(it => it._id !== id));

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    setSaving(true);
    try {
      const allPayables = [];
      selected.forEach(it => {
        const totalParcels = it.installment_total || 1;
        const currentParcel = it.installment_number || 1;
        
        for (let i = 0; i <= (totalParcels - currentParcel); i++) {
          const mDate = addMonths(parseISO(it.date), i);
          allPayables.push({
            description: `${it.description} ${totalParcels > 1 ? `(${currentParcel + i}/${totalParcels})` : ''}`.trim(),
            amount: it.amount,
            due_date: format(mDate, 'yyyy-MM-dd') + 'T12:00:00',
            competencia: format(mDate, 'yyyy-MM-01'),
            category: it.category,
            origin_id: card.id,
            origin_type: 'card',
            status: 'provisioned'
          });
        }
      });
      await base44.entities.Payable.bulkCreate(allPayables);
      toast.success(`${allPayables.length} lançamentos gerados!`);
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar');
      setSaving(false);
    }
  };

  const selectedTotal = useMemo(() => items.filter(it => it.selected).reduce((acc, it) => acc + it.amount, 0), [items]);
  const diff = Math.abs(selectedTotal - invoiceTotalFromBank);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl font-sora max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="font-black uppercase text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Revisão de Fatura
          </DialogTitle>
          {step === 'review' && (
            <Button variant="ghost" size="sm" onClick={() => setStep('upload')} className="text-red-500 font-black text-[10px] uppercase">
              <Trash2 className="w-3 h-3 mr-1" /> Deletar Tudo
            </Button>
          )}
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-20 border-2 border-dashed rounded-[2rem] text-center cursor-pointer hover:bg-slate-50" onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-slate-300 mb-4" />
            <p className="font-black text-slate-500 uppercase">Anexar PDF da Fatura</p>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="font-black text-[10px] text-slate-400 uppercase tracking-widest">Limpando ruídos e projetando parcelas...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex justify-between items-center ${diff < 0.1 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-2">
                {diff < 0.1 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                <p className="text-[10px] font-black uppercase text-slate-700">{diff < 0.1 ? 'Conciliado' : `Divergência: ${fmt(diff)}`}</p>
              </div>
            </div>

            <div className="border rounded-2xl overflow-hidden divide-y bg-white">
              {items.map((it) => (
                <div key={it._id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <input type="checkbox" checked={it.selected} onChange={() => updateItem(it._id, 'selected', !it.selected)} className="w-4 h-4 accent-primary" />
                  <div className="flex-1">
                    <input className="w-full bg-transparent border-none p-0 text-xs font-bold uppercase focus:ring-0" value={it.description} onChange={(e) => updateItem(it._id, 'description', e.target.value)} />
                    <div className="flex gap-2 items-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{it.date_display} • {it.category}</span>
                      {it.installment_total > 1 && <Badge className="h-4 text-[8px] bg-blue-100 text-blue-600 font-black">{it.installment_number}/{it.installment_total}</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <input type="number" className={`w-24 bg-transparent border-none p-0 text-right text-xs font-black focus:ring-0 ${it.amount < 0 ? 'text-emerald-600' : 'text-red-600'}`} value={it.amount} onChange={(e) => updateItem(it._id, 'amount', e.target.value)} />
                    {it.installment_total > it.installment_number && <p className="text-[7px] font-bold text-slate-400 uppercase flex items-center justify-end gap-1"><Calendar className="w-2 h-2"/> +{it.installment_total - it.installment_number} meses</p>}
                  </div>
                  <button onClick={() => deleteItem(it._id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] flex justify-between items-center text-white">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase">Total Selecionado</p>
                <p className="text-2xl font-black">{fmt(selectedTotal)}</p>
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