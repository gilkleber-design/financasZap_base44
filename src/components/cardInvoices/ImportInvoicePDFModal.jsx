import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Upload, FileText, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addMonths, format, parseISO } from 'date-fns';
import { CategorySelect } from '@/components/ui/category-select';
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function toReviewItem(item) {
  const [, month, day] = item.date.split('-');

  return {
    _id: Math.random().toString(36),
    description: item.description || '',
    amount: Number(item.amount) || 0,
    date: item.date,
    date_display: `${day}/${month}`,
    is_reversal: !!item.is_reversal || Number(item.amount) < 0,
    parcel_current: item.parcel_current || null,
    parcel_total: item.parcel_total || null,
    selected: true,
    category_id: '',
  };
}

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setStep('processing');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('extractInvoicePDF', {
        file_url,
        ref_month: refMonth,
      });

      const extracted = (response.data.items || []).map(toReviewItem);
      if (extracted.length === 0) {
        toast.error('Nenhum lançamento encontrado no PDF');
        setStep('upload');
        return;
      }

      setItems(extracted);
      setStep('review');
    } catch (error) {
      console.error('Erro no processamento:', error);
      toast.error(`Erro: ${error.message}`);
      setStep('upload');
    }
  };

  const deleteItem = (id) => setItems(prev => prev.filter(it => it._id !== id));

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
        const total = it.parcel_total || 1;
        const current = it.parcel_current || 1;
        const originalDate = it.date ? it.date + 'T12:00:00' : null;

        for (let i = 0; i <= (total - current); i++) {
          const mDate = addMonths(parseISO(refMonth + '-01'), i);
          allPayables.push({
            description: `${it.description}${total > 1 ? ` (parcela ${current + i}/${total})` : ''}`.trim(),
            amount: it.amount,
            due_date: format(mDate, 'yyyy-MM-dd') + 'T12:00:00',
            competencia: format(mDate, 'yyyy-MM-01'),
            purchase_date: originalDate,
            category_id: it.category_id || null,
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
      toast.error('Erro ao salvar no banco');
      setSaving(false);
    }
  };

  const totalSelected = useMemo(
    () => items.filter(it => it.selected).reduce((acc, it) => acc + it.amount, 0),
    [items]
  );

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
            <p className="font-black text-[10px] text-slate-400 uppercase">Processando PDF...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="border rounded-2xl overflow-hidden divide-y bg-white max-h-[50vh] overflow-y-auto shadow-sm">
              {items.map((it) => (
                <div key={it._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <input type="checkbox" checked={it.selected} onChange={() => {
                    setItems(items.map(x => x._id === it._id ? { ...x, selected: !x.selected } : x))
                  }} className="w-4 h-4 accent-primary" />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        className="bg-transparent border-none p-0 text-xs font-bold uppercase focus:ring-0 w-full text-slate-700"
                        value={it.description}
                        onChange={(e) => setItems(items.map(x => x._id === it._id ? { ...x, description: e.target.value } : x))}
                      />
                      {it.is_reversal && (
                        <Badge className="bg-red-50 text-red-600 border-none text-[9px] font-black h-5">
                          ESTORNO
                        </Badge>
                      )}
                      {it.parcel_total > 1 && (
                        <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black h-5">
                          {it.parcel_current}/{it.parcel_total}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{it.date_display} •</span>
                      <CategorySelect
                        value={it.category_id || ''}
                        valueKey="id"
                        onChange={(value) => setItems(items.map(x => x._id === it._id ? { ...x, category_id: value } : x))}
                        className="h-6 border-0 bg-transparent p-0 text-[9px] font-black text-slate-400 uppercase shadow-none"
                      />
                    </div>
                  </div>

                  <CurrencyInput
                    className="w-28 bg-transparent border-none p-0 text-right text-xs font-black shadow-none focus-visible:ring-0 text-slate-700"
                    value={it.amount}
                    onChange={(value) => setItems(items.map(x => x._id === it._id ? { ...x, amount: parseFloat(value) || 0 } : x))}
                  />

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