import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const sortByName = (items) => [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

export function useCategories() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 100),
  });

  const sortedCategories = sortByName(categories);
  const roots = sortByName(sortedCategories.filter(c => !c.parent_id && c.active !== false));
  const getChildren = (parentId) => sortByName(sortedCategories.filter(c => c.parent_id === parentId && c.active !== false));
  
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

  // Flat list com APENAS as categorias do banco: raízes primeiro, depois subcategorias
   const flatForSelect = [];
   const rootsActive = roots.filter(c => c.active !== false);
   rootsActive.forEach(root => {
     flatForSelect.push({ value: root.slug, label: root.name, isRoot: true });
     const childrenActive = getChildren(root.id).filter(c => c.active !== false);
     childrenActive.forEach(child => {
       flatForSelect.push({ value: child.slug, label: child.name, isChild: true });
     });
   });

  return {
    categories: sortedCategories,
    roots,
    getChildren,
    getCategoryLabel,
    getCategoryColor,
    flatForSelect,
    isLoading,
  };
}