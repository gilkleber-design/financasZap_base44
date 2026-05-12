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
      outros: 'bg-slate-100 text-slate-700',
    };
    return CATEGORY_COLORS[slug] || CATEGORY_COLORS.outros;
  };

  // Flat list com todas as categorias (padrão + personalizadas)
  const flatForSelect = [
    // Padrões enum
    { value: 'alimentacao', label: 'Alimentação' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'moradia', label: 'Moradia' },
    { value: 'saude', label: 'Saúde' },
    { value: 'educacao', label: 'Educação' },
    { value: 'lazer', label: 'Lazer' },
    { value: 'vestuario', label: 'Vestuário' },
    { value: 'servicos', label: 'Serviços' },
    { value: 'impostos', label: 'Impostos' },
    { value: 'outros', label: 'Outros' },
    // Personalizadas (com prefix cat_ para distinguir)
    ...categories
      .filter(c => c.active !== false)
      .map(c => ({ value: `cat_${c.id}`, label: c.parent_id ? `  → ${c.name}` : c.name })),
  ];

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