import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function extractTextFromPDF(buffer) {
  const { extractText } = await import('npm:unpdf@0.11.0');
  // Extrai página por página e concatena tudo
  const result = await extractText(buffer, { mergePages: false });
  const pages = result.text; // array de strings quando mergePages=false
  if (Array.isArray(pages)) {
    return pages.join('\n');
  }
  return String(pages);
}

function parseItauTransactions(raw) {
  const items = [];

  // Extrai o bloco entre "Lançamentos atuais" e "Compras parceladas" / "Resumo da fatura" / "Total desta fatura"
  const blockMatch = raw.match(/Lançamentos atuais[\s\S]*?(?=Compras parceladas|Resumo da fatura|Total desta fatura|$)/i);
  const block = blockMatch ? blockMatch[0] : raw;

  console.log('--- BLOCO DE LANÇAMENTOS ---');
  console.log(block.substring(0, 3000));

  // Regex global para capturar: DD/MM DESCRIÇÃO [XX/YY] VALOR
  // Aceita letras, números, espaços, acentos, traços, pontos nas descrições
  const txRegex = /(\d{2}\/\d{2})\s+([\wÀ-ÿ][\w\sÀ-ÿ.,'&\-*#@!()]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const installRegex = /^(.*?)\s+(\d{2})\/(\d{2})$/;

  let match;
  while ((match = txRegex.exec(block)) !== null) {
    let [, date, desc, valueStr] = match;
    desc = desc.trim();

    // Ignora linhas de totais/pagamentos
    if (/^(Total|Pagamento|Saldo|Encargo|IOF|Lançamentos)/i.test(desc)) continue;

    let installNumber = null;
    let installTotal = null;
    const instMatch = desc.match(installRegex);
    if (instMatch) {
      desc = instMatch[1].trim();
      installNumber = parseInt(instMatch[2], 10);
      installTotal = parseInt(instMatch[3], 10);
    }

    const amount = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
    const [day, month] = date.split('/');

    items.push({
      date_day: day,
      date_month: month,
      description: desc,
      amount,
      installment_number: installNumber,
      installment_total: installTotal,
    });
  }

  return items;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const response = await fetch(file_url);
    const buffer = new Uint8Array(await response.arrayBuffer());
    const text = await extractTextFromPDF(buffer);

    const parsed = parseItauTransactions(text);

    console.log('--- PARSED ITEMS COUNT:', parsed.length);
    parsed.forEach((it, i) => console.log(`  [${i}] ${it.date_day}/${it.date_month} | ${it.description} | ${it.amount}`));

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
        installment_number: item.installment_number,
        installment_total: item.installment_total,
      };
    });

    const invoice_total = items
      .filter(it => it.amount > 0)
      .reduce((s, it) => s + it.amount, 0);

    return Response.json({
      items,
      integrity_check: { invoice_total: Math.round(invoice_total * 100) / 100 },
      debug_text: text.substring(0, 3000),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});