import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);


export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); // 'upload' | 'processing' | 'review' | 'done'
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editForm, setEditForm] = useState({});

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') return toast.error('Selecione um arquivo PDF');
    setStep('processing');

    // Upload do PDF
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    // Extrai lançamentos via backend function (sem timeout do browser)
    const response = await base44.functions.invoke('extractInvoicePDF', {
      file_url,
      ref_month: refMonth,
    });

    const result = response.data;

    const extracted = (result?.items || []).map((item, i) => ({
      ...item,
      _id: i,
      selected: true,
    }));

    setItems(extracted);
    setStep('review');
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
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Selecione ao menos um item');
    setSaving(true);

    const genGroupId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

    // Agrupa parcelados pelo grupo de parcela (mesma descrição base)
    const groupMap = {};
    const payables = selected.map(it => {
      const hasInst = it.installment_number && it.installment_total;
      let installment_group_id = undefined;
      if (hasInst) {
        if (!groupMap[it.description]) groupMap[it.description] = genGroupId();
        installment_group_id = groupMap[it.description];
      }

      return {
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
        ...(hasInst ? {
          installment_number: it.installment_number,
          installment_count: it.installment_total,
          installment_total_amount: it.amount * it.installment_total,
          installment_group_id,
        } : {}),
      };
    });

    await base44.entities.Payable.bulkCreate(payables);
    toast.success(`${payables.length} lançamentos importados!`);
    setSaving(false);
    setStep('done');
    onImported();
  };

  const selectedCount = items.filter(it => it.selected).length;
  const selectedTotal = items.filter(it => it.selected).reduce((s, it) => s + (it.amount || 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Importar Fatura PDF — {card.name}
          </DialogTitle>
        </DialogHeader>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="w-full border-2 border-dashed border-border rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/60 hover:bg-accent/30 transition-all"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-medium">Clique ou arraste o PDF da fatura</p>
              <p className="text-xs text-muted-foreground">Apenas arquivos .pdf</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            <Button variant="outline" onClick={onClose} className="w-full">Cancelar</Button>
          </div>
        )}

        {/* STEP: processing */}
        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-sm font-medium">Analisando PDF com IA...</p>
            <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
          </div>
        )}

        {/* STEP: review */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{items.length} lançamentos encontrados</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setItems(p => p.map(i => ({ ...i, selected: true })))}>
                  Selec. todos
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setItems(p => p.map(i => ({ ...i, selected: false })))}>
                  Desmarcar
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${it.selected ? 'bg-white' : 'bg-muted/30 opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={it.selected}
                    onChange={() => toggleItem(idx)}
                    className="w-4 h-4 accent-primary cursor-pointer flex-shrink-0"
                  />

                  {editingIdx === idx ? (
                    <div className="flex-1 flex gap-2 items-center">
                      <Input
                        value={editForm.description}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        className="text-xs h-7 flex-1"
                      />
                      <Input
                        type="number"
                        value={editForm.amount}
                        onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                        className="text-xs h-7 w-24 flex-shrink-0"
                      />
                      <Button size="icon" className="w-7 h-7 flex-shrink-0" onClick={() => saveEdit(idx)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="w-7 h-7 flex-shrink-0" onClick={() => setEditingIdx(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{it.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{it.date}</span>
                          {it.installment_number && it.installment_total && (
                            <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">
                              {it.installment_number}/{it.installment_total}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs py-0 h-4 px-1.5">{it.category}</Badge>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-red-500 flex-shrink-0">{fmt(it.amount)}</span>
                      <Button variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-primary" onClick={() => startEdit(idx)}>
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-red-500" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-sm font-semibold">
                {selectedCount} selecionados · <span className="text-red-500">{fmt(selectedTotal)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={handleImport} disabled={saving || selectedCount === 0}>
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</> : `Importar ${selectedCount} itens`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700">Fatura importada!</p>
              <p className="text-sm text-muted-foreground mt-1">Todos os lançamentos foram criados como provisionados.</p>
            </div>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}