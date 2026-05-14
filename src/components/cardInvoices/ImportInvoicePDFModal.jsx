import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addMonths, format, parseISO } from 'date-fns';
import * as pdfjsLib from 'pdfjs-dist';

// Configura worker inline para evitar problemas de CORS
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupa itens por linha (Y) com tolerância de 2pt
    const rows = [];
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, str: item.str.trim() });
    }

    // Ordena por Y decrescente (topo → baixo) e dentro de cada linha por X crescente
    rows.sort((a, b) => b.y - a.y);
    const pageText = rows.map(row => {
      row.items.sort((a, b) => a.x - b.x);
      return row.items.map(it => it.str).join('  ');
    }).join('\n');

    pageTexts.push(pageText);
  }

  return pageTexts.join('\n--- PAGE BREAK ---\n');
}

// Mapeamento de categorias do Itaú para slugs internos
const ITAU_CATEGORY_MAP = {
  'educacao': 'educacao',
  'transporte': 'transporte',
  'saude': 'saude',
  'supermercado': 'alimentacao',
  'restaurante': 'alimentacao',
  'vestuario': 'vestuario',
  'lazer': 'lazer',
  'servicos': 'servicos',
  'outros': 'outros',
};

const CATEGORY_SUFFIXES = /\s+(transporte|alimentacao|saude|educacao|lazer|vestuario|servicos|supermercado|restaurante|outros|farmacia)\s+\S+$/i;

function makePayable(date, desc, valueStr, refYear, refMonthNum) {
  // Remove sufixo de categoria do Itaú: "NomeEstab transporte Sao Paulo"
  desc = desc.replace(CATEGORY_SUFFIXES, '').trim();

  // Detecta parcela no final: "Nome 09/12"
  let installNumber = null;
  let installTotal = null;
  const instMatch = desc.match(/^(.*?)\s+(\d{2})\/(\d{2})$/);
  if (instMatch) {
    desc = instMatch[1].trim();
    installNumber = parseInt(instMatch[2], 10);
    installTotal = parseInt(instMatch[3], 10);
  }

  const amount = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
  const [day, month] = date.split('/');
  const itemMonth = parseInt(month, 10);
  let year = refYear;
  if (itemMonth > refMonthNum) year = refYear - 1;
  const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  return {
    _id: Math.random().toString(36),
    description: desc.trim(),
    amount,
    date: dateStr,
    date_display: `${day}/${month}`,
    installment_number: installNumber,
    installment_total: installTotal,
    selected: true,
    category_id: '',
  };
}

function parseItauTransactions(raw, refMonth) {
  const items = [];
  const [refYear, refMonthNum] = refMonth.split('-').map(Number);

  // Regex que encontra uma transação: DD/MM  NOME  VALOR
  // - Entre data e nome: 1+ espaços (às vezes é só 1)
  // - Entre nome e valor: 2+ espaços (separador de coluna PDF)
  const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s{2,}(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g;

  // Normaliza o texto: remove espaços extras que o pdfjs insere em caracteres especiais
  // Ex: "Lan  ç  amentos" → "Lançamentos"
  const normalized = raw
    .replace(/Lan\s*[cç]\s*amentos/gi, 'Lançamentos')
    .replace(/\bs\s*[aá]\s*[uú]\s*de\b/gi, 'saúde')
    .replace(/servi\s*[cç]\s*os/gi, 'serviços')
    .replace(/vestu\s*[aá]\s*rio/gi, 'vestuário');

  // Verifica se tem ao menos um bloco de lançamentos
  if (!/Lançamentos[:\s]*compras e saques/i.test(normalized)) {
    console.log('=== SEM BLOCO DE LANÇAMENTOS ===\n', normalized.substring(0, 2000));
    return items;
  }

  // Extrai bloco de compras/saques: do início até o subtotal "Lançamentos no cart"
  let block = normalized.replace(/^[\s\S]*?Lançamentos[:\s]*compras e saques/i, '');
  block = block.replace(/Lançamentos no cart[\s\S]*/i, '');

  // Extrai lançamentos de produtos/serviços: captura DD/MM após o cabeçalho PRODUTOS/serviços
  // até o marcador de subtotal "Lançamentos produtos e serviços"
  const prodServSection = normalized.match(/PRODUTOS\/servi[çc]os\s+VALOR[^\n]*([\s\S]*?)(?:Lançamentos produtos e servi|Compras parceladas|Encargos cobrados|Limites de cr[eé]dito|Pr[oó]xima fatura)/i);
  if (prodServSection) {
    // Extrai apenas as linhas que começam com DD/MM
    const prodLines = prodServSection[1].split('\n').filter(l => /^\d{2}\/\d{2}\s+/.test(l.trim()));
    block += '\n' + prodLines.join('\n');
  }

  console.log('=== BLOCK FULL ===\n', block);

  let m;
  while ((m = txRegex.exec(block)) !== null) {
    const [, date, desc, valueStr] = m;

    // Pula cabeçalhos e totais
    if (/^(DATA|VALOR|ESTABELECIMENTO|PAGAMENTO|Total dos|Total do|GIL |continua)/i.test(desc.trim())) continue;
    // Pula valores negativos (pagamentos)
    if (valueStr.startsWith('-')) continue;

    items.push(makePayable(date, desc, valueStr, refYear, refMonthNum));
  }

  return items;
}

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list()
  });

  const handleFile = async (file) => {
    if (!file) return;
    setStep('processing');
    try {
      const text = await extractTextFromPDF(file);
      console.log('=== PDF TEXT (first 3000) ===\n', text.substring(0, 3000));
      const extracted = parseItauTransactions(text, refMonth);
      console.log('=== ITEMS FOUND:', extracted.length, '===');
      if (extracted.length > 0) {
        console.log('=== FIRST 5 ITEMS ===', JSON.stringify(extracted.slice(0, 5), null, 2));
        const total = extracted.reduce((s, i) => s + i.amount, 0);
        console.log('=== TOTAL CALCULADO:', total.toFixed(2), '===');
      }

      if (extracted.length === 0) {
        console.log('=== FULL TEXT ===\n', text);
        toast.error('Nenhum lançamento encontrado no PDF');
        setStep('upload');
        return;
      }

      setItems(extracted);
      setStep('review');
    } catch (error) {
      console.error('Erro no processamento:', error);
      toast.error(`Erro: ${error.message}`);
      setStep('upload');
    }
  };

  const deleteItem = (id) => setItems(prev => prev.filter(it => it._id !== id));

  const clearInvoice = () => {
    setItems([]);
    setStep('upload');
    toast.info('Fatura descartada');
  };

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Nenhum item selecionado');
    setSaving(true);

    try {
      const allPayables = [];
      selected.forEach(it => {
        const total = it.installment_total || 1;
        const current = it.installment_number || 1;
        const originalDate = it.date ? it.date + 'T12:00:00' : null;

        for (let i = 0; i <= (total - current); i++) {
          const mDate = addMonths(parseISO(refMonth + '-01'), i);
          allPayables.push({
            description: `${it.description}${total > 1 ? ` (parcela ${current + i}/${total})` : ''}`.trim(),
            amount: it.amount,
            due_date: format(mDate, 'yyyy-MM-dd') + 'T12:00:00',
            competencia: format(mDate, 'yyyy-MM-01'),
            purchase_date: originalDate,
            category_id: it.category_id || null,
            origin_id: card.id,
            origin_type: 'card',
            status: 'provisioned'
          });
        }
      });

      await base44.entities.Payable.bulkCreate(allPayables);
      toast.success('Lançamentos importados com sucesso!');
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar no banco');
      setSaving(false);
    }
  };

  const totalSelected = useMemo(
    () => items.filter(it => it.selected).reduce((acc, it) => acc + it.amount, 0),
    [items]
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl font-sora">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="font-black uppercase text-slate-800 flex items-center gap-2 text-sm">
            <FileText className="w-5 h-5 text-primary" /> Fatura: {refMonth}
          </DialogTitle>
          {step === 'review' && (
            <Button variant="ghost" size="sm" onClick={clearInvoice} className="text-red-500 font-black text-[10px] uppercase flex items-center gap-1 hover:bg-red-50 px-3">
              <Trash2 className="w-3.5 h-3.5" /> Deletar Fatura
            </Button>
          )}
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-20 border-2 border-dashed rounded-[2rem] text-center cursor-pointer hover:bg-slate-50" onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-black text-slate-500 uppercase">Anexar PDF da Fatura</p>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="font-black text-[10px] text-slate-400 uppercase">Processando PDF...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="border rounded-2xl overflow-hidden divide-y bg-white max-h-[50vh] overflow-y-auto shadow-sm">
              {items.map((it) => (
                <div key={it._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <input type="checkbox" checked={it.selected} onChange={() => {
                    setItems(items.map(x => x._id === it._id ? { ...x, selected: !x.selected } : x))
                  }} className="w-4 h-4 accent-primary" />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        className="bg-transparent border-none p-0 text-xs font-bold uppercase focus:ring-0 w-full text-slate-700"
                        value={it.description}
                        onChange={(e) => setItems(items.map(x => x._id === it._id ? { ...x, description: e.target.value } : x))}
                      />
                      {it.installment_total > 1 && (
                        <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black h-5">
                          {it.installment_number}/{it.installment_total}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{it.date_display} •</span>
                      <select
                        className="bg-transparent border-none p-0 text-[9px] font-black text-slate-400 uppercase focus:ring-0 cursor-pointer hover:text-slate-600 w-auto"
                        value={it.category_id || ''}
                        onChange={(e) => setItems(items.map(x => x._id === it._id ? { ...x, category_id: e.target.value } : x))}
                      >
                        <option value="">SEM CATEGORIA</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <input
                    type="number"
                    className="w-20 bg-transparent border-none p-0 text-right text-xs font-black focus:ring-0 text-slate-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={it.amount}
                    onChange={(e) => setItems(items.map(x => x._id === it._id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                  />

                  <button onClick={() => deleteItem(it._id)} className="text-slate-300 hover:text-red-500 p-2 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] flex justify-between items-center text-white">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase">Total Selecionado</p>
                <p className="text-2xl font-black">{fmt(totalSelected)}</p>
              </div>
              <Button onClick={handleImport} disabled={saving} className="h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl px-8">
                {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}