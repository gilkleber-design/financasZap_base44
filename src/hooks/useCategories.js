import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const sortByName = (items) => [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

export function useCategories() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 100),
  });

  const sortedCategories = sortByName(categories);
  const roots = sortByName(sortedCategories.filter(c => !c.parent_id && c.active !== false));
  const getChildren = (parentId) => sortByName(sortedCategories.filter(c => c.parent_id === parentId && c.active !== false));
  
  const normalize = (str) => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const findCategory = (slugOrName) => {
    if (!slugOrName) return null;
    const v = String(slugOrName);
    return categories.find(c => 
      c.slug === v || 
      c.name?.toLowerCase() === v.toLowerCase() || 
      normalize(c.name) === normalize(v) ||
      normalize(c.slug) === normalize(v)
    );
  };

  const getCategoryLabel = (slug) => {
    const cat = findCategory(slug);
    return normalizeCategoryLabel(cat?.name || cat?.slug || slug);
  };

  const getCategoryColor = (slug) => {
    // Usa a cor definida na categoria, ou fallback genérico
    const cat = findCategory(slug);
    if (cat?.color) {
      const hex = cat.color;
      // Converte hex para classe Tailwind aproximada
      return 'bg-indigo-100 text-indigo-700'; // fallback genérico para cores customizadas
    }
    return 'bg-slate-100 text-slate-700';
  };

  // Flat list com APENAS as categorias do banco: raízes primeiro, depois subcategorias
   const flatForSelect = [];
   const seenLabels = new Set();
   const rootsActive = roots.filter(c => c.active !== false);
   rootsActive.forEach(root => {
     const rootLabel = normalizeCategoryLabel(root.name || root.slug);
     if (!seenLabels.has(rootLabel)) {
       flatForSelect.push({ value: root.slug, label: rootLabel, type: root.type || 'expense', isRoot: true });
       seenLabels.add(rootLabel);
     }
     const childrenActive = getChildren(root.id).filter(c => c.active !== false);
     childrenActive.forEach(child => {
       const childLabel = normalizeCategoryLabel(child.name || child.slug);
       const dedupeKey = `${root.id}-${childLabel}`;
       if (!seenLabels.has(dedupeKey)) {
         flatForSelect.push({ value: child.slug, label: childLabel, type: child.type || root.type || 'expense', isChild: true });
         seenLabels.add(dedupeKey);
       }
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