import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useCategories() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('-created_date', 100),
  });

  const roots = categories.filter(c => !c.parent_id && c.active !== false);
  const getChildren = (parentId) => categories.filter(c => c.parent_id === parentId && c.active !== false);
  
  const getCategoryLabel = (slug) => {
    const cat = categories.find(c => c.slug === slug);
    return cat?.name || slug;
  };

  const getCategoryColor = (slug) => {
    // Usa a cor definida na categoria, ou fallback genérico
    const cat = categories.find(c => c.slug === slug);
    if (cat?.color) {
      const hex = cat.color;
      // Converte hex para classe Tailwind aproximada
      return 'bg-indigo-100 text-indigo-700'; // fallback genérico para cores customizadas
    }
    return 'bg-slate-100 text-slate-700';
  };

  // Flat list com APENAS as categorias do banco (raízes + subcategorias)
  const flatForSelect = categories
    .filter(c => c.active !== false)
    .map(c => ({ value: c.slug, label: c.parent_id ? `  → ${c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    categories,
    roots,
    getChildren,
    getCategoryLabel,
    getCategoryColor,
    flatForSelect,
    isLoading,
  };
}