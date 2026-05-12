import { useState, useMemo } from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Search } from 'lucide-react';
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
  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i, /\s*RIO DE JANEIRO\s*BRA?$/i, /\s*BELO HORIZONTE\s*BRA?$/i,
    /\s*BRASILIA\s*BRA?$/i, /\s*FORTALEZA\s*BRA?$/i, /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i, /\s*PORTO ALEGRE\s*BRA?$/i, /[A-Z]{3,}BRA$/, /[A-Z]{3,}BR$/, /\s+BRA$/i, /\s+BR$/i,
  ];
  let cleaned = desc.trim();
  for (const re of geoSuffixes) {
    cleaned = cleaned.replace(re, '').trim();
  }
  return cleaned;
};

export default function AuditReportAccordion({ payables = [], onRowClick, categories = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState([]);

  // Agrupamento multinível: Categoria Raiz > Subcategorias > Transações
  const organizedData = useMemo(() => {
    const catMap = {};
    const parentMap = {}; // parent_id -> categoria raiz
    
    categories.forEach(c => {
      catMap[c.id] = c;
      if (c.parent_id) {
        parentMap[c.id] = c.parent_id;
      }
    });

    // Agrupar por categoria raiz
    const byRoot = {};
    
    payables.forEach(item => {
      let rootKey;
      
      if (item.category_id) {
        const catData = catMap[item.category_id];
        if (catData?.parent_id) {
          // É uma subcategoria: agrupar sob categoria pai
          rootKey = catData.parent_id;
        } else {
          // É categoria raiz personalizada
          rootKey = item.category_id;
        }
      } else {
        // É enum-based
        rootKey = item.category || 'outros';
      }
      
      if (!byRoot[rootKey]) byRoot[rootKey] = [];
      byRoot[rootKey].push(item);
    });

    // Processar cada categoria raiz
    return Object.entries(byRoot)
      .map(([rootKey, items]) => {
        // Agrupar items por subcategoria (category_id)
        const bySubcat = {};
        const enumItems = [];
        
        items.forEach(item => {
          if (item.category_id) {
            const catData = catMap[item.category_id];
            if (catData?.parent_id === rootKey) {
              // É subcategoria desta raiz
              if (!bySubcat[item.category_id]) bySubcat[item.category_id] = [];
              bySubcat[item.category_id].push(item);
            } else {
              // É item enum ou outra raiz, não de subcategoria
              enumItems.push(item);
            }
          } else {
            // É item direto sem category_id
            enumItems.push(item);
          }
        });

        // Criar subcategorias
        const subcategories = Object.entries(bySubcat)
          .map(([subcatId, subcatItems]) => {
            const matchedItems = subcatItems.filter(item => {
              const desc = sanitizeDescription(item.description).toLowerCase();
              return desc.includes(searchTerm.toLowerCase());
            });
            return matchedItems.length > 0 ? {
              id: subcatId,
              label: catMap[subcatId]?.name || subcatId,
              items: matchedItems.sort((a, b) => new Date(b.due_date) - new Date(a.due_date)),
              total: matchedItems.reduce((s, i) => s + (i.amount || 0), 0),
            } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.total - a.total);

        // Filtrar enum items
        const matchedEnumItems = enumItems.filter(item => {
          const desc = sanitizeDescription(item.description).toLowerCase();
          return desc.includes(searchTerm.toLowerCase());
        });

        // Label da raiz
        const label = catMap[rootKey]?.name || CATEGORY_LABELS[rootKey] || rootKey;

        const totalEnum = matchedEnumItems.reduce((s, i) => s + (i.amount || 0), 0);
        const totalSubcats = subcategories.reduce((s, sc) => s + sc.total, 0);

        return {
          id: rootKey,
          label,
          items: matchedEnumItems.sort((a, b) => new Date(b.due_date) - new Date(a.due_date)),
          total: totalEnum + totalSubcats,
          subcategories,
        };
      })
      .filter(cat => cat.items.length > 0 || cat.subcategories.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [payables, searchTerm, categories]);

  // Auto-abrir categorias quando há busca
  const categoriesToOpen = useMemo(() => {
    if (!searchTerm) return [];
    return organizedData.map(c => c.id);
  }, [searchTerm, organizedData]);

  const handleExportCSV = () => {
    const rows = [['Data', 'Descrição', 'Categoria', 'Valor', 'Parcelado']];
    organizedData.forEach(cat => {
      cat.items.forEach(item => {
        const installmentStr = item.installment_number ? `${item.installment_number}/${item.installment_total}` : '-';
        rows.push([
          format(new Date(item.due_date), 'dd/MM/yyyy'),
          sanitizeDescription(item.description),
          cat.label,
          item.amount.toString(),
          installmentStr,
        ]);
      });
    });

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const data = organizedData.map(cat => ({
      categoria: cat.label,
      total: cat.total,
      itens: cat.items.map(item => ({
        data: format(new Date(item.due_date), 'dd/MM/yyyy'),
        descricao: sanitizeDescription(item.description),
        valor: item.amount,
        parcelado: item.installment_number ? `${item.installment_number}/${item.installment_total}` : null,
        status: item.status,
      })),
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
  };

  const totalGeral = organizedData.reduce((s, c) => s + c.total, 0);

  const getLevelClasses = (level) => {
    if (level === 0) return 'bg-white';
    if (level === 1) return 'bg-slate-50';
    return 'bg-slate-100';
  };

  const getLevelIndent = (level) => {
    return `pl-${level * 4}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição (ex: Uber, Mercado)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportJSON} className="gap-2">
            <Download className="h-4 w-4" /> JSON
          </Button>
        </div>
      </div>

      {organizedData.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum lançamento registrado'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Auditoria de Despesas</CardTitle>
                <Badge variant="secondary">{fmt(totalGeral)}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" value={searchTerm ? categoriesToOpen : openCategories} onValueChange={setOpenCategories}>
                {organizedData.map((catData) => (
                  <div key={catData.id}>
                    <AccordionItem value={catData.id} className="border-b">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="text-left flex-1">
                            <p className="font-medium">{catData.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {catData.items.length} item(ns)
                              {catData.subcategories?.length > 0 && ` + ${catData.subcategories.length} subcategoria(s)`}
                            </p>
                          </div>
                          <Badge variant="default">{fmt(catData.total + (catData.subcategoryTotal || 0))}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-0 pb-4">
                        {/* Itens diretos da categoria enum */}
                        {catData.items.length > 0 && (
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-sm">
                              <thead className="border-b">
                                <tr className="text-muted-foreground text-xs">
                                  <th className="text-left p-2 font-medium">Data</th>
                                  <th className="text-left p-2 font-medium">Descrição</th>
                                  <th className="text-right p-2 font-medium w-20">Valor</th>
                                  <th className="text-center p-2 font-medium w-16">Parcela</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catData.items.map((item) => {
                                  const hasInstallment = item.installment_number && item.installment_total;
                                  const description = sanitizeDescription(item.description);
                                  const isHighlight = searchTerm && description.toLowerCase().includes(searchTerm.toLowerCase());

                                  return (
                                    <tr
                                      key={item.id}
                                      onClick={() => onRowClick(item)}
                                      className={`border-b hover:bg-muted/50 cursor-pointer transition ${isHighlight ? 'bg-accent/30' : ''}`}
                                    >
                                      <td className="p-2">{format(new Date(item.due_date), 'dd/MM/yyyy')}</td>
                                      <td className="p-2 truncate max-w-xs">{description}</td>
                                      <td className="p-2 text-right font-semibold">{fmt(item.amount)}</td>
                                      <td className="p-2 text-center">
                                        {hasInstallment && (
                                          <Badge variant="secondary" className="text-xs">
                                            {item.installment_number}/{item.installment_total}
                                          </Badge>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Subcategorias */}
                        {catData.subcategories?.length > 0 && (
                          <div className="space-y-2 pl-4">
                            {catData.subcategories.map((subcat) => (
                              <div key={subcat.id} className="border-l-2 border-slate-200 pl-4 py-2">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-semibold text-slate-700">{subcat.label}</p>
                                  <Badge variant="secondary" className="text-xs">{fmt(subcat.total)}</Badge>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead className="border-b">
                                      <tr className="text-muted-foreground">
                                        <th className="text-left p-2 font-medium">Data</th>
                                        <th className="text-left p-2 font-medium">Descrição</th>
                                        <th className="text-right p-2 font-medium w-16">Valor</th>
                                        <th className="text-center p-2 font-medium w-12">Parcela</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subcat.items.map((item) => {
                                        const hasInstallment = item.installment_number && item.installment_total;
                                        const description = sanitizeDescription(item.description);
                                        const isHighlight = searchTerm && description.toLowerCase().includes(searchTerm.toLowerCase());

                                        return (
                                          <tr
                                            key={item.id}
                                            onClick={() => onRowClick(item)}
                                            className={`border-b hover:bg-muted/50 cursor-pointer transition ${isHighlight ? 'bg-accent/30' : ''}`}
                                          >
                                            <td className="p-2">{format(new Date(item.due_date), 'dd/MM/yyyy')}</td>
                                            <td className="p-2 truncate max-w-xs">{description}</td>
                                            <td className="p-2 text-right font-semibold">{fmt(item.amount)}</td>
                                            <td className="p-2 text-center">
                                              {hasInstallment && (
                                                <Badge variant="secondary" className="text-xs">
                                                  {item.installment_number}/{item.installment_total}
                                                </Badge>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </div>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}