import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function extractTextFromPDF(buffer) {
  const { extractText } = await import('npm:unpdf@0.11.0');
  const { text } = await extractText(buffer, { mergePages: true });
  return text;
}

// Quebra o texto corrido em tokens e remonta linhas no formato "DD/MM DESCRIÇÃO VALOR"
function preprocessText(raw) {
  // Insere quebra antes de cada padrão de data DD/MM
  const withBreaks = raw.replace(/(\d{2}\/\d{2}(?=\s+[A-ZÁÉÍÓÚÃÕÂÊÔÇ]))/g, '\n$1');
  return withBreaks;
}

function parseItauTransactions(text) {
  const items = [];
  const processed = preprocessText(text);
  const lines = processed.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const txPattern = /^(\d{2}\/\d{2})\s+(.*)\s+(\d[\d.]*,\d{2})$/;
  const installPattern = /^(.*?)\s+(\d{2})\/(\d{2})$/;

  let inTransactions = false;
  let inFutureInstallments = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detecta início da seção de lançamentos
    if (/Lançamentos atuais|lançamentos do período/i.test(line)) { inTransactions = true; i++; continue; }
    // Detecta fim da seção (parcelas futuras ou resumo)
    if (/Compras parceladas|próximas faturas|Resumo da fatura|Total desta fatura/i.test(line)) { inFutureInstallments = true; i++; continue; }
    
    if (!inTransactions || inFutureInstallments) { i++; continue; }

    if (
      /^DATA\s+(ESTABELECIMENTO|PRODUTOS|VALOR)/i.test(line) ||
      /^Pagamento efetuado/i.test(line) ||
      /^Total/i.test(line) ||
      /^continua\.\.\./i.test(line)
    ) { i++; continue; }

    const txMatch = line.match(txPattern);
    if (txMatch) {
      let [, date, middle, valueStr] = txMatch;
      middle = middle.trim();
      let installNumber = null;
      let installTotal = null;

      const instMatch = middle.match(installPattern);
      if (instMatch) {
        middle = instMatch[1].trim();
        installNumber = parseInt(instMatch[2], 10);
        installTotal = parseInt(instMatch[3], 10);
      }

      const amount = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));

      const [day, month] = date.split('/');
      items.push({
        date_day: day,
        date_month: month,
        description: middle,
        amount,
        installment_number: installNumber,
        installment_total: installTotal,
      });
    }

    i++;
  }

  return items;
}

function mapCategory(raw) {
  const t = (raw || '').toLowerCase();
  if (t === 'transporte') return 'transporte';
  if (t === 'supermercado') return 'supermercado';
  if (t === 'saúde' || t === 'saude') return 'saude';
  if (t === 'educacao' || t === 'educação') return 'educacao';
  if (t === 'lazer') return 'lazer';
  if (t === 'vestuário' || t === 'vestuario') return 'vestuario';
  if (t === 'serviços' || t === 'servicos') return 'servicos';
  if (t === 'restaurante') return 'restaurante';
  return 'outros';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const response = await fetch(file_url);
    const buffer = new Uint8Array(await response.arrayBuffer());
    const text = await extractTextFromPDF(buffer);

    const parsed = parseItauTransactions(text);

    const [refYear, refMonthNum] = ref_month.split('-').map(Number);

    const items = parsed.map(item => {
      const itemMonth = parseInt(item.date_month, 10);
      let year = refYear;
      if (itemMonth > refMonthNum) year = refYear - 1;

      const dateStr = `${year}-${item.date_month.padStart(2, '0')}-${item.date_day.padStart(2, '0')}`;

      return {
        description: item.description,
        amount: item.amount,
        date: dateStr,
        category: item.category,
        installment_number: item.installment_number,
        installment_total: item.installment_total,
      };
    });

    const invoice_total = items
      .filter(it => it.amount > 0)
      .reduce((s, it) => s + it.amount, 0);

    console.log('--- DEBUG TEXT COMPLETO ---');
    console.log(text.substring(0, 4000));
    console.log('--- PARSED ITEMS COUNT:', parsed.length);

    return Response.json({
      items,
      integrity_check: { invoice_total: Math.round(invoice_total * 100) / 100 },
      debug_text: text.substring(0, 2000),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});