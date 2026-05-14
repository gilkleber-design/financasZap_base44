import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ManageInvoiceItemsModal({ items, cardName, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const queryClient = useQueryClient();

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditData({ description: item.description, amount: item.amount });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async (id) => {
    await base44.entities.Payable.update(id, {
      description: editData.description,
      amount: parseFloat(editData.amount) || 0,
    });
    queryClient.invalidateQueries({ queryKey: ['payables'] });
    setEditingId(null);
    toast.success('Lançamento atualizado');
  };

  const deleteItem = async (id) => {
    await base44.entities.Payable.delete(id);
    queryClient.invalidateQueries({ queryKey: ['payables'] });
    setDeletingId(null);
    toast.success('Lançamento removido');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl font-sora max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="font-black uppercase text-slate-800 text-sm">
            Lançamentos — {cardName}
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y border rounded-2xl bg-white overflow-hidden shadow-sm">
          {items.length === 0 && (
            <p className="text-center text-slate-400 text-xs font-bold uppercase py-10">Nenhum lançamento</p>
          )}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
              {editingId === item.id ? (
                <>
                  <div className="flex-1 flex gap-2">
                    <Input
                      className="h-7 text-xs font-bold uppercase"
                      value={editData.description}
                      onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                    />
                    <Input
                      className="h-7 w-24 text-xs font-bold text-right"
                      type="number"
                      value={editData.amount}
                      onChange={e => setEditData(d => ({ ...d, amount: e.target.value }))}
                    />
                  </div>
                  <button onClick={() => saveEdit(item.id)} className="text-emerald-500 hover:text-emerald-700 p-1"><Check className="w-4 h-4" /></button>
                  <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase text-slate-700 truncate">{item.description}</p>
                    <span className="text-[9px] font-black text-slate-400 uppercase">
                      {item.due_date ? format(new Date(item.due_date.includes('T') ? item.due_date : item.due_date + 'T12:00:00'), 'dd/MM/yy') : '--'} • {item.category || 'outros'}
                    </span>
                  </div>
                  <span className={`text-xs font-black min-w-[80px] text-right ${item.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {fmt(item.amount)}
                  </span>
                  <button onClick={() => startEdit(item)} className="text-slate-300 hover:text-primary p-1 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  {deletingId === item.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase px-2 py-1 bg-red-50 rounded">Sim</button>
                      <button onClick={() => setDeletingId(null)} className="text-slate-400 text-[10px] font-black uppercase px-2 py-1 bg-slate-100 rounded">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(item.id)} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-[10px] font-black text-slate-400 uppercase">
            {items.length} lançamentos • Total: <span className="text-slate-700">{fmt(items.reduce((s, i) => s + i.amount, 0))}</span>
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="font-bold text-xs">Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}