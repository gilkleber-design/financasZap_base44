import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizePdfText(text) {
  return text
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\d{2}\/\d)\s+(\d)/g, '$1$2')
    .replace(/(\d{1,3}(?:\.\d{3}),)\s+(\d{2})/g, '$1$2')
    .replace(/Lan\s[cç]\samentos/gi, 'Lançamentos')
    .replace(/Pa\sg\sa\sm\se\sn\st\so/gi, 'Pagamento')
    .replace(/Pa\sg\sa\sm\se\sn\st\so\ss/gi, 'Pagamentos')
    .replace(/L\si\sm\si\st\se/gi, 'Limite')
    .replace(/T\so\st\sa\sl/gi, 'Total')
    .replace(/Pr\s[oó]\sdutos/gi, 'Produtos')
    .replace(/Pr\s[oó]\sxima/gi, 'Próxima')
    .replace(/Pr\s[oó]\sximas/gi, 'Próximas')
    .replace(/Servi\s[cç]\sos/gi, 'Serviços')
    .replace(/Compras\s+e\s+Saques/gi, 'Compras e Saques')
    .replace(/\bs\s[aá]\s*[uú]\sde\b/gi, 'saúde')
    .replace(/vestu\s[aá]\s*rio/gi, 'vestuário')
    .replace(/\n{3,}/g, '\n\n');
}

async function extractTextFromPDF(buffer) {
  const pdfjsModule = await import('npm:pdfjs-dist@3.11.174/legacy/build/pdf.js');
  const pdfjsLib = pdfjsModule.default || pdfjsModule;
  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  
  const pdf = await loadingTask.promise;
  const streamPages = [];
  const rowPages = [];
  const columnPages = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = [];
    
    for (const item of content.items) {
      const str = String(item.str || '').trim();
      if (!str) continue;

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str });
    }

    streamPages.push(content.items.map(item => String(item.str || '').trim()).filter(Boolean).join('\n'));
    rowPages.push(rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .join('\n'));

    const leftText = rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.filter(it => it.x < 300).sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .filter(Boolean)
      .join('\n');
    const rightText = rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.filter(it => it.x >= 300).sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .filter(Boolean)
      .join('\n');
    columnPages.push(`${leftText}\n--- COLUMN BREAK ---\n${rightText}`);
  }
  
  return {
    streamText: normalizePdfText(streamPages.join('\n--- PAGE BREAK ---\n')),
    rowText: normalizePdfText(rowPages.join('\n--- PAGE BREAK ---\n')),
    columnText: normalizePdfText(columnPages.join('\n--- PAGE BREAK ---\n')),
  };
}

function brlToNumber(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function resolveDate(date, refMonth) {
  const [refYear, refMonthNum] = refMonth.split('-').map(Number);
  const [day, month] = date.split('/');
  const itemMonth = Number(month);
  const year = itemMonth > refMonthNum ? refYear - 1 : refYear;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function cleanDescription(description) {
  return description
    .replace(/\s+(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\s+\S+$/i, '')
    .replace(/\b(MAIS\s+DETALHES|DETALHES|VER\s+MAIS)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function descriptionFingerprint(description) {
  return String(description || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(MAIS\s+DETALHES|DETALHES|VER\s+MAIS)\b/gi, '')
    .replace(/[^A-Z0-9]/gi, '')
    .replace(/^DL/, '')
    .toUpperCase();
}

function isSameTransaction(a, b) {
  if (a.date !== b.date || a.amount !== b.amount) return false;
  if ((a.parcel_current || '') !== (b.parcel_current || '')) return false;
  if ((a.parcel_total || '') !== (b.parcel_total || '')) return false;
  const aDesc = descriptionFingerprint(a.description);
  const bDesc = descriptionFingerprint(b.description);
  return aDesc === bDesc || aDesc.includes(bDesc) || bDesc.includes(aDesc);
}

function isSameInstallmentPurchase(a, b) {
  if (!a.parcel_total || !b.parcel_total) return false;
  if (a.date !== b.date || a.amount !== b.amount || a.parcel_total !== b.parcel_total) return false;
  const aDesc = descriptionFingerprint(a.description);
  const bDesc = descriptionFingerprint(b.description);
  return aDesc === bDesc || aDesc.includes(bDesc) || bDesc.includes(aDesc);
}

function compactText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function isLikelyDescription(line) {
  if (!line || line.length < 3) return false;
  if (/^\d{2}\/\d{2}$/.test(line)) return false;
  if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(line)) return false;
  if (/^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA|PAGAMENTO)$/i.test(line)) return false;
  if (/\b(LIMITE|TOTAL\s+(DA|DESTA|DOS|PARA|LANÇAMENTOS|TRANS[AÁ]ÇÕES)|PR[ÓO]XIMA\s+FATURA|DEMAIS\s+FATURAS|VALOR\s+EM\s+R\$|CR[EÉ]DITO\s+ROTATIVO|ENCARGOS?\s+FINANCEIROS|JUROS\s+DO|JUROS\s+DE|MULTA\s+POR|IOF\s+DE)\b/i.test(line)) return false;
  if (/^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i.test(line)) return false;
  const compact = compactText(line);
  if (/^(PAGAMENTO|PAGAMENTOS|TOTALDOSPAGAMENTOS|LIMITETOTALDECREDITO|LIMITEDISPONIVEL|LIMITETOTALUTILIZADO|PROXIMAFATURA|DEMAISFATURAS|TOTALPARAPROXIMASFATURAS)/.test(compact)) return false;
  return /[A-Za-zÀ-ÿ]/.test(line);
}

function extractExpectedTotal(raw) {
  const match = raw.match(/Lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i) || raw.match(/L\s+Lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i);
  return match ? brlToNumber(match[1].replace(/\s+/g, '')) : null;
}

function isFinanceChargeItem(description) {
  const text = description || '';
  if (/REPASSE\s+DE\s+IOF/i.test(text)) return false;
  return /\b(MULTA|JUROS\s+DE\s+MORA|JUROS\s+DO\s+ROTATIVO|ENCARGOS?\s+REFINANCIAMENT|ENCARGOS?\s+FINANCEIROS|IOF(?:\s+DE\s+FINANCIAMENTO)?)\b/i.test(text);
}

function parseItauTransactions(raw, refMonth) {
  const skipDescription = /^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA|PAGAMENTO)/i;
  const categoryLine = /^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i;
  const paymentPattern = /\b(PAGAMENTO|PAGTO|PGTO|D[ÉE]BITO\s+AUTOM[ÁA]TICO|PAG\s+FATURA)\b/i;
  const summaryPattern = /\b(LIMITE|TOTAL\s+(DA|DESTA|DOS|PARA|LANÇAMENTOS|TRANS[AÁ]ÇÕES)|PR[ÓO]XIMA\s+FATURA|DEMAIS\s+FATURAS|VALOR\s+EM\s+R\$|CR[EÉ]DITO\s+ROTATIVO|ENCARGOS?\s+FINANCEIROS|JUROS\s+DO|JUROS\s+DE|MULTA\s+POR|IOF\s+DE)\b/i;
  const reversalPattern = /\b(ESTORNO|CR[ÉE]DITO|CREDITO|DEVOLU[CÇ][AÃ]O|REEMBOLSO|CANCELAMENTO)\b/i;
  const dateLine = /^\d{2}\/\d{2}$/;
  const moneyLine = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  
  const items = [];
  const seen = new Set();
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  let active = false;
  
  const isStopLine = (line) => /COMPRASPARCELADASPROXIMASFATURAS|LIMITESDECREDITO|ENCARGOSCOBRADOS|SIMULACAODECOMPRAS|NOVOTETODEJUROS|FIQUEATENTOAOSENCARGOS/.test(compactText(line));
  const isStartLine = (line) => /LANCAMENTOS(COMPRAS|PRODUTOSESERVICOS|PRODUTOS|INTERNACIONAIS)/.test(compactText(line));
  
  const addItem = (dateToken, rawDescription, amountText) => {
    let description = cleanDescription(rawDescription);
    if (!description || description.length < 3) return;
    
    description = description.replace(/\b\d{2}\/\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
    const compactDescription = compactText(description);
    
    if (!description || skipDescription.test(description)) return;
    if (paymentPattern.test(description) || summaryPattern.test(description)) return;
    if (/^(PAGAMENTO|PAGAMENTOS|TOTALDOSPAGAMENTOS|LIMITETOTALDECREDITO|LIMITEDISPONIVEL|LIMITETOTALUTILIZADO|PROXIMAFATURA|DEMAISFATURAS|TOTALPARAPROXIMASFATURAS|LANCAMENTOSNOCARTAO|LANCAMENTOSPRODUTOSESERVICOS)/.test(compactDescription)) return;
    
    let parcelCurrent = null;
    let parcelTotal = null;
    const parcelMatch = rawDescription.match(/(\d{1,2})\/(\d{1,2})/);
    if (parcelMatch) {
      parcelCurrent = Number(parcelMatch[1]);
      parcelTotal = Number(parcelMatch[2]);
    }

    const isReversal = reversalPattern.test(description) || amountText.startsWith('-');
    const amount = isReversal ? -Math.abs(brlToNumber(amountText)) : brlToNumber(amountText);
    if (!Number.isFinite(amount) || Math.abs(amount) > 20000) return;

    const date = resolveDate(dateToken, refMonth);
    const itemDate = new Date(`${date}T12:00:00`);
    const minDate = new Date(`${refMonth}-01T12:00:00`);
    minDate.setMonth(minDate.getMonth() - 2);
    if (itemDate < minDate && !parcelTotal && amount > 0) return;

    const key = `${date}|${descriptionFingerprint(description)}|${amount}|${parcelCurrent || ''}|${parcelTotal || ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({ date, description, amount, is_reversal: isReversal, parcel_current: parcelCurrent, parcel_total: parcelTotal });
  };
  
  for (let i = 0; i < lines.length; i++) {
    const compact = compactText(lines[i]);
    if (isStopLine(lines[i])) active = false;
    if (isStartLine(lines[i])) {
      active = true;
      continue;
    }
    
    if (!active || !dateLine.test(lines[i])) continue;
    const dateToken = lines[i];
    const descParts = [];
    let amount = '';

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      if (isStartLine(lines[j]) || isStopLine(lines[j])) break;
      if (dateLine.test(lines[j]) && descParts.length > 0 && !moneyLine.test(lines[j + 1] || '')) break;
      if (moneyLine.test(lines[j])) {
        amount = lines[j];
        break;
      }
      if (categoryLine.test(lines[j])) continue;
      if (isLikelyDescription(lines[j])) descParts.push(lines[j]);
    }

    if (amount && descParts.length) addItem(dateToken, descParts.join(' '), amount);
  }
  
  const activeBlocks = [];
  let currentBlock = [];
  active = false;
  
  for (const line of lines) {
    if (isStopLine(line)) {
      if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
      active = false;
    }
    if (isStartLine(line)) {
      if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
      active = true;
      continue;
    }
    if (active) currentBlock.push(line);
  }
  
  if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));
  
  for (const activeBlock of activeBlocks) {
    const inlineRegex = /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+\d{2}\/\d{2}\s+|\n|$)/g;
    let match;
    while ((match = inlineRegex.exec(activeBlock)) !== null) {
      const description = match[2].split(/\n/).filter(line => !categoryLine.test(line.trim())).join(' ');
      addItem(match[1], description, match[3]);
    }
  }
  
  return items.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
  });
}

async function extractWithLLMFallback(base44, rawText, refMonth, expectedTotal, fileUrl) {
  const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Leia a fatura Itaú anexada e extraia TODOS os lançamentos atuais.\n\nRegras obrigatórias:\n- Retorne apenas itens que compõem exatamente "Lançamentos atuais" (${expectedTotal || 'total indicado na fatura'}).\n- Inclua compras/saques, lançamentos internacionais e produtos/serviços/anuidade.\n- Inclua cancelamentos/estornos como valores negativos.\n- Exclua pagamentos efetuados, resumo, limites, encargos, simulações e "compras parceladas - próximas faturas".\n- Para parcelas, inclua somente a parcela do mês atual que aparece nos lançamentos atuais.\n- Retorne datas em YYYY-MM-DD usando mês de referência ${refMonth}.\n- A soma dos amounts deve bater com "Lançamentos atuais".\n\nTexto auxiliar extraído do PDF:\n${rawText.slice(0, 20000)}`,
    file_urls: fileUrl ? [fileUrl] : undefined,
    response_json_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              description: { type: 'string' },
              amount: { type: 'number' },
              is_reversal: { type: 'boolean' },
              parcel_current: { type: ['number', 'null'] },
              parcel_total: { type: ['number', 'null'] }
            },
            required: ['date', 'description', 'amount']
          }
        }
      },
      required: ['items']
    }
  });
  
  return (response.items || []).map(item => ({
    date: item.date,
    description: item.description,
    amount: Number(item.amount) || 0,
    is_reversal: !!item.is_reversal || Number(item.amount) < 0,
    parcel_current: item.parcel_current || null,
    parcel_total: item.parcel_total || null,
  })).filter(item => item.date && item.description && Number.isFinite(item.amount) && !isFinanceChargeItem(item.description));
}

async function getPayload(req) {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const refMonth = form.get('ref_month');
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo PDF não enviado');
    }

    return {
      refMonth: String(refMonth || ''),
      buffer: new Uint8Array(await file.arrayBuffer()),
      fileUrl: null,
    };
  }
  
  const body = await req.json();
  if (!body.file_url) throw new Error('Arquivo PDF não enviado');
  const response = await fetch(body.file_url);
  if (!response.ok) throw new Error('Não foi possível baixar o PDF');
  return {
    refMonth: String(body.ref_month || ''),
    buffer: new Uint8Array(await response.arrayBuffer()),
    fileUrl: body.file_url,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buffer, refMonth, fileUrl } = await getPayload(req);
    if (!/^\d{4}-\d{2}$/.test(refMonth)) {
      return Response.json({ error: 'ref_month inválido' }, { status: 400 });
    }

    const { streamText, rowText, columnText } = await extractTextFromPDF(buffer);
    const expectedTotal = extractExpectedTotal(streamText) || extractExpectedTotal(rowText) || extractExpectedTotal(columnText);
    const candidates = [streamText, rowText, columnText].map(text => {
      const parsedItems = parseItauTransactions(text, refMonth);
      const total = Number(parsedItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
      return { items: parsedItems, total, diff: expectedTotal ? Math.abs(total - expectedTotal) : 0 };
    });
    
    let best = candidates.sort((a, b) => a.diff - b.diff || b.items.length - a.items.length)[0];
    const uniqueItems = [];

    for (const item of best.items) {
      const existingIndex = uniqueItems.findIndex(existing => isSameTransaction(existing, item) || isSameInstallmentPurchase(existing, item));
      if (existingIndex >= 0) {
        const current = uniqueItems[existingIndex];
        const shouldReplace = item.description.length > current.description.length || (item.parcel_current || 0) < (current.parcel_current || 0);
        if (shouldReplace) uniqueItems[existingIndex] = item;
        continue;
      }
      uniqueItems.push(item);
    }

    uniqueItems.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
    });

    let extractedTotal = Number(uniqueItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    let finalItems = uniqueItems;

    if (expectedTotal && Math.abs(extractedTotal - expectedTotal) > 1) {
      const fallbackItems = await extractWithLLMFallback(base44, streamText, refMonth, expectedTotal, fileUrl);
      const fallbackTotal = Number(fallbackItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
      if (fallbackItems.length > 0 && Math.abs(fallbackTotal - expectedTotal) < Math.abs(extractedTotal - expectedTotal)) {
        finalItems = fallbackItems;
        extractedTotal = fallbackTotal;
      }
    }

    return Response.json({ expected_total: expectedTotal, extracted_total: extractedTotal, items: finalItems });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});