import { useState, useMemo } from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { format } from 'date-fns';

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', transferencia_liquidacao: 'Transferência',
  outros: 'Outros',
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const sanitizeDescription = (desc) => {
  if (!desc) return desc;
  return desc.replace(/\s+(SAO PAULO|SALVADOR|CURITIBA|VITORIA|RIO DE JANEIRO|BELO HORIZONTE|BRASILIA|FORTALEZA|RECIFE|MANAUS|PORTO ALEGRE|BRA|BR)$/gi, '').trim();
};

export default function AuditReportAccordion({ payables = [], onRowClick, categories = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState([]);

  const organizedData = useMemo(() => {
    // 1. Mapas de busca por ID e por Nome (Slug) para evitar erros de vínculo
    const catMap = {};
    const slugToId = {};
    categories.forEach(c => { 
      catMap[String(c.id)] = c;
      if (c.slug) slugToId[c.slug.toLowerCase()] = String(c.id);
    });

    const groups = {};
    const subcategoryIdsFound = new Set();

    payables.forEach(item => {
      const desc = sanitizeDescription(item.description).toLowerCase();
      if (searchTerm && !desc.includes(searchTerm.toLowerCase())) return;

      // Tenta achar o ID da categoria, seja pelo ID salvo ou pelo slug
      let currentCatId = item.category_id ? String(item.category_id) : (slugToId[item.category?.toLowerCase()] || 'outros');
      let currentCatData = catMap[currentCatId];

      let rootId = currentCatId;
      let subId = null;

      // LÓGICA DE ANINHAMENTO FORÇADA
      if (currentCatData && currentCatData.parent_id) {
        rootId = String(currentCatData.parent_id);
        subId = currentCatId;
        subcategoryIdsFound.add(subId);
      }

      if (!groups[rootId]) {
        groups[rootId] = { 
          id: rootId, 
          label: catMap[rootId]?.name || CATEGORY_LABELS[rootId] || rootId, 
          items: [], 
          subcategories: {},
          total: 0 
        };
      }

      if (subId) {
        if (!groups[rootId].subcategories[subId]) {
          groups[rootId].subcategories[subId] = { 
            id: subId, 
            label: catMap[subId]?.name || subId, 
            items: [], 
            total: 0 
          };
        }
        groups[rootId].subcategories[subId].items.push(item);
        groups[rootId].subcategories[subId].total += (item.amount || 0);
      } else {
        groups[rootId].items.push(item);
      }
      
      groups[rootId].total += (item.amount || 0);
    });

    return Object.values(groups)
      .filter(group => !subcategoryIdsFound.has(String(group.id)))
      .sort((a, b) => b.total - a.total);

  }, [payables, searchTerm, categories]);

  const totalGeral = organizedData.reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por descrição..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="pl-9"
          />
        </div>
      </div>

      {organizedData.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Auditoria de Despesas</CardTitle>
            <Badge variant="secondary" className="text-sm">{fmt(totalGeral)}</Badge>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" value={openCategories} onValueChange={setOpenCategories}>
              {organizedData.map((cat) => (
                <AccordionItem key={cat.id} value={String(cat.id)} className="border-b last:border-0">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-bold text-slate-700 capitalize">{cat.label}</span>
                      <Badge variant="default" className="bg-primary/90">{fmt(cat.total)}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6">
                    {cat.items.length > 0 && <TableRender items={cat.items} onRowClick={onRowClick} />}
                    {Object.values(cat.subcategories).map(sub => (
                      <div key={sub.id} className="mt-4 ml-6 border-l-4 border-primary/20 pl-4 bg-slate-50/50 p-4 rounded-r-lg shadow-inner">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-primary uppercase tracking-widest">{sub.label}</span>
                          <Badge variant="outline" className="text-[10px] bg-white">{fmt(sub.total)}</Badge>
                        </div>
                        <TableRender items={sub.items} onRowClick={onRowClick} isSub />
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TableRender({ items, onRowClick, isSub = false }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${isSub ? 'text-[11px]' : 'text-xs'}`}>
        <thead className="text-muted-foreground border-b">
          <tr>
            <th className="text-left py-2 px-1 font-medium">Data</th>
            <th className="text-left py-2 px-1 font-medium">Descrição</th>
            <th className="text-right py-2 px-1 font-medium">Valor</th>
            <th className="text-center py-2 px-1 font-medium w-16">Parcela</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(item => (
            <tr key={item.id} onClick={() => onRowClick(item)} className="hover:bg-primary/5 cursor-pointer transition-colors">
              <td className="py-2 px-1">{format(new Date(item.due_date), 'dd/MM/yyyy')}</td>
              <td className="py-2 px-1 font-medium text-slate-700">{sanitizeDescription(item.description)}</td>
              <td className="py-2 px-1 text-right font-bold text-slate-900">{fmt(item.amount)}</td>
              <td className="py-2 px-1 text-center text-[10px]">
                {item.installment_number ? `${item.installment_number}/${item.installment_count || item.installment_total}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}