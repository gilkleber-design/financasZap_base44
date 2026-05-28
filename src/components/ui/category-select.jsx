import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import NewCategoryModal from '@/components/categories/NewCategoryModal';

const CATEGORY_COLORS = {
  alimentacao: 'bg-orange-100 text-orange-700',
  transporte: 'bg-yellow-100 text-yellow-700',
  moradia: 'bg-blue-100 text-blue-700',
  saude: 'bg-red-100 text-red-700',
  educacao: 'bg-green-100 text-green-700',
  lazer: 'bg-pink-100 text-pink-700',
  vestuario: 'bg-purple-100 text-purple-700',
  servicos: 'bg-indigo-100 text-indigo-700',
  impostos: 'bg-gray-100 text-gray-700',
  transferencia_liquidacao: 'bg-slate-100 text-slate-700',
  outros: 'bg-slate-100 text-slate-700',
};

export function CategorySelect({
  value,
  onChange,
  placeholder = 'Selecionar categoria',
  includeTransfer = false,
  allowNone = true,
  valueKey = 'slug',
  className = '',
  allowedTypes,
}) {
  const [showNewCategory, setShowNewCategory] = useState(false);
  const { categories, roots, getChildren, isLoading } = useCategories();

  const typeFilter = Array.isArray(allowedTypes) && allowedTypes.length > 0 ? allowedTypes : null;
  const isAllowed = (category) => !typeFilter || typeFilter.includes(category.type || 'expense');
  const activeCategories = categories.filter(c => c.active !== false && isAllowed(c));
  const visibleRoots = roots.filter(c => c.active !== false && isAllowed(c));
  
  const normalize = (str) => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  const selectedCategory = activeCategories.find(c => {
    const v = String(value);
    return String(c[valueKey]) === v || 
           c.name?.toLowerCase() === v.toLowerCase() || 
           normalize(c.name) === normalize(v) ||
           normalize(c.slug) === normalize(v);
  });

  useEffect(() => {
    if (value && selectedCategory && String(selectedCategory[valueKey]) !== String(value)) {
      onChange(selectedCategory[valueKey], selectedCategory);
    }
  }, [value, selectedCategory, valueKey, onChange]);

  const selectValue = selectedCategory ? String(selectedCategory[valueKey]) : (value || '_none');

  const emitChange = (nextValue) => {
    if (nextValue === '__new_category__') {
      setShowNewCategory(true);
      return;
    }
    if (nextValue === '_none') {
      onChange('', null);
      return;
    }
    const category = activeCategories.find(c => String(c[valueKey]) === String(nextValue));
    onChange(nextValue, category || null);
  };

  const handleCreated = (category) => {
    setShowNewCategory(false);
    onChange(category[valueKey], category);
  };

  return (
    <>
      <Select value={selectValue} onValueChange={emitChange} disabled={isLoading}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
          {selectedCategory && (
            <Badge className={`ml-2 text-xs border-0 ${CATEGORY_COLORS[selectedCategory.slug] || CATEGORY_COLORS.outros}`}>
              {selectedCategory.name}
            </Badge>
          )}
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="_none">Nenhuma</SelectItem>}
          {visibleRoots.map((cat) => {
            const children = getChildren(cat.id).filter(isAllowed);
            return (
              <div key={cat.id}>
                <SelectItem value={String(cat[valueKey])} className="font-semibold">
                  {cat.name}
                </SelectItem>
                {children.map((child) => (
                  <SelectItem key={child.id} value={String(child[valueKey])} className="ml-4">
                    → {child.name}
                  </SelectItem>
                ))}
              </div>
            );
          })}
          {includeTransfer && (
            <SelectItem value="transferencia_liquidacao" className="font-semibold">
              Transferência / Liquidação
            </SelectItem>
          )}
          <SelectItem value="__new_category__" className="border-t mt-1 pt-2 font-semibold text-primary">
            <Plus className="w-4 h-4 mr-2 inline" /> Nova categoria
          </SelectItem>
        </SelectContent>
      </Select>

      {showNewCategory && (
        <NewCategoryModal
          onClose={() => setShowNewCategory(false)}
          onSaved={handleCreated}
          defaultType={typeFilter?.[0] || 'expense'}
        />
      )}
    </>
  );
}

export { CATEGORY_COLORS };