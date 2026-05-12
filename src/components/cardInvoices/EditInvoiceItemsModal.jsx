import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Pencil, Trash2, Check, X } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function EditInvoiceItemsModal({ items: initialItems, onClose, onSaved }) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ description: item.description, amount: item.amount });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (item) => {
    if (!editForm.description || !editForm.amount) return toast.error('Preencha os campos');
    setSaving(true);
    const updated = { ...item, description: editForm.description, amount: parseFloat(editForm.amount), status: item.status === 'paid' ? 'paid' : 'provisioned' };
    await base44.entities.Payable.update(item.id, { description: updated.description, amount: updated.amount, status: updated.status });
    setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    toast.success('Item atualizado');
    setSaving(false);
    setEditingId(null);
    onSaved();
  };

  const deleteItem = async (item) => {
    setSaving(true);
    await base44.entities.Payable.delete(item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
    toast.success('Item removido');
    setSaving(false);
    setDeletingId(null);
    onSaved();
  };

  const bulkDelete = async () => {
    setSaving(true);
    await Promise.all([...selected].map(id => base44.entities.Payable.delete(id)));
    setItems(prev => prev.filter(i => !selected.has(i.id)));
    toast.success(`${selected.size} item(s) removido(s)`);
    setSelected(new Set());
    setConfirmBulkDelete(false);
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Itens da Fatura</DialogTitle>
        </DialogHeader>

        {/* Barra de seleção */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            <span className="text-sm text-muted-foreground">
              {someSelected ? `${selected.size} selecionado(s)` : 'Selecionar todos'}
            </span>
          </div>
          {someSelected && !confirmBulkDelete && (
            <Button size="sm" variant="destructive" className="text-xs h-7 gap-1" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" />
              Excluir selecionados
            </Button>
          )}
          {confirmBulkDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Confirmar exclusão de {selected.size} item(s)?</span>
              <Button size="sm" variant="destructive" className="text-xs h-7" onClick={bulkDelete} disabled={saving}>
                Confirmar
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setConfirmBulkDelete(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>

        <div className="divide-y divide-border">
          {items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item na fatura</p>
          )}
          {items.map(item => (
            <div key={item.id} className="py-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Input
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição"
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={editForm.amount}
                      onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="Valor"
                      className="text-sm"
                    />
                    <Button size="icon" className="w-9 h-9 flex-shrink-0" onClick={() => saveEdit(item)} disabled={saving}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="outline" className="w-9 h-9 flex-shrink-0" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : deletingId === item.id ? (
                <div className="flex items-center justify-between gap-2 bg-red-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-700 flex-1">Excluir <strong>{item.description}</strong>?</p>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => deleteItem(item)} disabled={saving}>
                      Excluir
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setDeletingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    {item.competencia && (
                      <p className="text-xs text-muted-foreground">Comp: {item.competencia.slice(0, 7)}</p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-red-500 flex-shrink-0">{fmt(item.amount)}</span>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-primary flex-shrink-0" onClick={() => startEdit(item)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500 flex-shrink-0" onClick={() => setDeletingId(item.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border flex justify-between items-center">
          <p className="text-sm font-semibold">
            Total: <span className="text-red-500">{fmt(items.reduce((s, i) => s + (i.amount || 0), 0))}</span>
          </p>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}