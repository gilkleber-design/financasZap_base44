import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#64748b'];
const sortByName = (items) => [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

function CategoryForm({ initial, parentId, parentOptions, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    slug: initial?.slug || '',
    type: initial?.type || 'expense',
    color: initial?.color || DEFAULT_COLORS[0],
    parent_id: initial?.parent_id || parentId || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const autoSlug = (name) => name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const handleNameChange = (v) => {
    set('name', v);
    if (!initial) set('slug', autoSlug(v));
  };

  const handleSave = async () => {
    if (!form.name || !form.slug || !form.type) return toast.error('Nome, slug e tipo são obrigatórios');
    setSaving(true);
    await onSave({ ...form, parent_id: form.parent_id || null, active: true });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Categoria' : parentId ? 'Nova Subcategoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => handleNameChange(e.target.value)} className="mt-1" placeholder="Ex: Alimentação" />
          </div>
          <div>
            <Label>Identificador (slug)</Label>
            <Input value={form.slug} onChange={e => set('slug', e.target.value)} className="mt-1 font-mono text-xs" placeholder="alimentacao" />
            <p className="text-xs text-muted-foreground mt-1">Usado internamente. Não altere após criar.</p>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v, parent_id: '' }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!parentId && (
            <div>
              <Label>Categoria Pai (deixe vazio para raiz)</Label>
              <Select value={form.parent_id || 'none'} onValueChange={v => set('parent_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Categoria raiz —</SelectItem>
                  {parentOptions.filter(p => (p.type || 'expense') === form.type).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoryManager() {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState(null);
  const [addingParentId, setAddingParentId] = useState(undefined); // undefined = não abrindo, null = raiz, string = subcategoria

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['categories']); toast.success('Categoria criada!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['categories']); toast.success('Categoria atualizada!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['categories']); toast.success('Removida!'); },
  });

  const roots = sortByName(categories.filter(c => !c.parent_id && c.active !== false));
  const childrenOf = (id) => sortByName(categories.filter(c => c.parent_id === id && c.active !== false));

  const handleSave = async (data) => {
    if (editingCategory) {
      await updateMutation.mutateAsync({ id: editingCategory.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Categorias de Despesas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Usadas em Lançamentos, Contas a Pagar e Recorrências</p>
        </div>
        <Button size="sm" onClick={() => { setEditingCategory(null); setAddingParentId(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Nova Categoria
        </Button>
      </div>

      {roots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-xl">
          Nenhuma categoria ainda. Crie a primeira!
        </p>
      )}

      <div className="space-y-2">
        {roots.map(root => {
          const children = childrenOf(root.id);
          return (
            <div key={root.id} className="border border-border rounded-xl overflow-hidden">
              {/* Categoria raiz */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: root.color || '#64748b' }} />
                <span className="text-sm font-semibold flex-1">{root.name}</span>
                <Badge className={`text-xs text-white ${root.type === 'income' ? 'bg-green-600' : root.type === 'transfer' ? 'bg-slate-500' : 'bg-red-600'}`}>{root.type === 'income' ? 'Receita' : root.type === 'transfer' ? 'Transferência' : 'Despesa'}</Badge>
                <Badge variant="outline" className="text-xs font-mono">{root.slug}</Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-blue-500"
                    onClick={() => { setAddingParentId(root.id); setEditingCategory(null); }}
                    title="Adicionar subcategoria">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground"
                    onClick={() => { setEditingCategory(root); setAddingParentId(undefined); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-500"
                    onClick={() => deleteMutation.mutate(root.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Subcategorias */}
              {children.map(child => (
                <div key={child.id} className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 border-t border-border">
                  <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.color || root.color || '#64748b' }} />
                  <span className="text-sm flex-1">{child.name}</span>
                  <Badge className={`text-xs text-white ${child.type === 'income' ? 'bg-green-600' : child.type === 'transfer' ? 'bg-slate-500' : 'bg-red-600'}`}>{child.type === 'income' ? 'Receita' : child.type === 'transfer' ? 'Transferência' : 'Despesa'}</Badge>
                  <Badge variant="outline" className="text-xs font-mono">{child.slug}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground"
                      onClick={() => { setEditingCategory(child); setAddingParentId(undefined); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-500"
                      onClick={() => deleteMutation.mutate(child.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Modal de criação/edição */}
      {(addingParentId !== undefined || editingCategory) && (
        <CategoryForm
          initial={editingCategory}
          parentId={addingParentId}
          parentOptions={roots}
          onSave={handleSave}
          onClose={() => { setEditingCategory(null); setAddingParentId(undefined); }}
        />
      )}
    </div>
  );
}