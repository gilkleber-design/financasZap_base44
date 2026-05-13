import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Check, X, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format, isAfter, endOfMonth, parseISO } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); // 'upload' | 'processing' | 'review' | 'done'
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [progress, setProgress] = useState(0);
  const [integrityCheck, setIntegrityCheck] = useState(null);

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') return toast.error('Selecione um arquivo PDF');
    setStep('processing');
    setProgress(0);
    
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 18, 90));
    }, 500);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const response = await base44.functions.invoke('extractInvoicePDF', {
        file_url,
        ref_month: refMonth,
      });

      const result = response.data;
      clearInterval(progressInterval);
      setProgress(100);

      // --- FILTRO DE INTELIGÊNCIA CONTRA DISCREPÂNCIA ---
      const lastDayOfMonth = endOfMonth(new Date(refMonth + '-01T12:00:00'));
      
      const extracted = (result?.items || []).map((item, i) => {
        // 1. Tratamento de Sinais (Estornos)
        const desc = item.description?.toLowerCase() || '';
        const isNegative = item.amount < 0 || desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls');
        const finalAmount = isNegative ? -Math.abs(item.amount) : Math.abs(item.amount);

        // 2. Trava de Data (Evitar itens do mês seguinte)
        const itemDate = item.date ? parseISO(item.date) : null;
        const isFuture = itemDate && isAfter(itemDate, lastDayOfMonth);

        return {
          ...item,
          amount: finalAmount,
          _id: i,
          selected: !isFuture, 
          is_future: isFuture
        };
      });

      setItems(extracted);
      setIntegrityCheck(result?.integrity_check || null);
      setStep('review');
    } catch (error) {
      clearInterval(progressInterval);
      toast.error('Erro ao processar fatura.');
      setStep('upload');
    }
  };

  const toggleItem = (idx) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  };

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditForm({ description: items[idx].description, amount: items[idx].amount });
  };

  const saveEdit = (idx) => {
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, description: editForm.description, amount: parseFloat(editForm.amount) || it.amount }
      : it
    ));
    setEditingIdx(null);
  };

  const handleImport = async () => {
    const { addMonths } = await import('date-fns');
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Selecione ao menos um item');
    setSaving(true);

    const genGroupId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    const processedGroups = new Set();
    const payables = [];
    const groupIds = {};

    selected.forEach(it => {
      const hasInst = it.installment_number && it.installment_total && it.installment_total > 1;
      const groupKey = hasInst ? `${it.description}|${it.installment_total}` : null;
      
      if (hasInst && !processedGroups.has(groupKey)) {
        if (!groupIds[groupKey]) groupIds[groupKey] = genGroupId();
        
        const startNum = it.installment_number;
        const totalCount = it.installment_total;
        const baseDate = new Date(refMonth + '-01T12:00:00');
        const monthlyAmount = it.amount;
        const totalAmount = monthlyAmount * totalCount;

        for (let num = startNum; num <= totalCount; num++) {
          const daysOffset = num - startNum;
          const futureDate = addMonths(baseDate, daysOffset);
          const futureDateStr = futureDate.toISOString().split('T')[0];

          payables.push({
            description: `${it.description} (${num}/${totalCount})`,
            amount: monthlyAmount,
            due_date: futureDateStr + 'T12:00:00',
            competencia: futureDateStr.substring(0, 7) + '-01',
            category: it.category || 'outros',
            status: 'provisioned',
            origin_id: card.id,
            origin_type: 'card',
            payment_modality: 'card_invoice',
            recurrent: false,
            installment_number: num,
            installment_count: totalCount,
            installment_total_amount: totalAmount,
            installment_group_id: groupIds[groupKey],
          });
        }
        processedGroups.add(groupKey);
      } else if (!hasInst) {
        payables.push({
          description: it.description,
          amount: it.amount,
          due_date: (it.date || refMonth + '-01') + 'T12:00:00',
          competencia: refMonth + '-01',
          category: it.category || 'outros',
          status: 'provisioned',
          origin_id: card.id,
          origin_type: 'card',
          payment_modality: 'card_invoice',
          recurrent: false,
        });
      }
    });

    try {
      await base44.entities.Payable.bulkCreate(payables);
      toast.success(`${payables.length} lançamentos importados!`);
      setSaving(false);
      setStep('done');
      onImported();
    } catch (e) {
      toast.error('Erro ao salvar no banco.');
      setSaving(false);
    }
  };

  const selectedTotal = useMemo(() => {
    return items.filter(it => it.selected).reduce((s, it) => s + (it.amount || 0), 0);
  }, [items]);
  
  const futurePayablesCount = useMemo(() => {
    const processedGroups = new Set();
    let total = 0;
    items.filter(it => it.selected).forEach(it => {
      const hasInst = it.installment_number && it.installment_total && it.installment_total > 1;
      const groupKey = hasInst ? `${it.description}|${it.installment_total}` : null;
      if (hasInst && !processedGroups.has(groupKey)) {
        total += (it.installment_total - it.installment_number + 1);
        processedGroups.add(groupKey);
      } else if (!hasInst) {
        total += 1;
      }
    });
    return total;
  }, [items]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Importar PDF — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/60 hover:bg-slate-50 transition-all"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Selecione o PDF do Itaú</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            <Button variant="ghost" onClick={onClose} className="w-full font-bold">CANCELAR</Button>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-sm font-black uppercase tracking-tighter">Sincronizando com IA...</p>
            <div className="w-full max-w-xs h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {integrityCheck && (Math.abs(integrityCheck.diff) > 0.1) && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-black text-red-700 uppercase tracking-tight">Divergência Detectada</p>
                  <p className="text-red-600 mt-1">O banco diz {fmt(integrityCheck.invoice_total)}, mas a IA somou {fmt(integrityCheck.total_extracted)}. Diferença: {fmt(integrityCheck.diff)}.</p>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden shadow-sm">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-3 px-4 py-3 transition-colors ${it.selected ? 'bg-white' : 'bg-slate-50 opacity-40'}`}>
                  <input
                    type="checkbox"
                    checked={it.selected}
                    onChange={() => toggleItem(idx)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className={`text-sm truncate font-bold uppercase ${it.amount < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {it.amount < 0 && '[ESTORNO] '} {it.description}
                        </p>
                        {it.is_future && <Badge className="bg-amber-100 text-amber-700 text-[8px] h-4">PROX. FATURA</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <span>{it.date}</span>
                      <span className="tracking-tighter">[{it.category}]</span>
                    </div>
                  </div>
                  <span className={`text-sm font-black ${it.amount < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {it.amount < 0 ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(idx)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl text-white shadow-xl">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Total Selecionado</p>
                  <p className="text-2xl font-black">{fmt(selectedTotal)}</p>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black uppercase text-slate-400">{futurePayablesCount} Lançamentos</p>
                   <Button onClick={handleImport} disabled={saving} className="mt-2 bg-white text-slate-900 hover:bg-slate-100 font-black">
                     {saving ? 'SALVANDO...' : 'IMPORTAR AGORA'}
                   </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <p className="text-lg font-black text-slate-900 uppercase">Importação Concluída!</p>
            <Button onClick={onClose} className="w-full h-12 font-bold">FECHAR</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}