import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBrl(value) {
  return Number(String(value || '').replace(/\./g, '').replace(',', '.')) || 0;
}

function parseDateBr(dateText) {
  const match = String(dateText || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function moneyToken(value) {
  return /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(String(value || '').trim());
}

function compact(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

async function getPayload(req) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo PDF não enviado');
    }
    return { buffer: new Uint8Array(await file.arrayBuffer()), debug: false };
  }

  const body = await req.json();
  if (!body.file_url) throw new Error('Arquivo PDF não enviado');

  const response = await fetch(body.file_url);
  if (!response.ok) throw new Error('Não foi possível baixar o PDF');
  return { buffer: new Uint8Array(await response.arrayBuffer()), debug: !!body.debug };
}

async function extractRowsFromPdf(buffer) {
  const pdfjsModule = await import('npm:pdfjs-dist@3.11.174/legacy/build/pdf.js');
  const pdfjsLib = pdfjsModule.default || pdfjsModule;
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  const allItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = [];

    for (const item of content.items) {
      const str = normalizeText(item.str);
      if (!str) continue;
      const x = Number(item.transform[4]) || 0;
      const y = Number(item.transform[5]) || 0;
      allItems.push({ x, y, str });

      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str });
    }

    pages.push(rows
      .sort((a, b) => b.y - a.y)
      .map(row => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) })));
  }

  const findHeaderX = (label, fallback) => {
    const item = allItems.find(it => compact(it.str).includes(label));
    return item ? item.x : fallback;
  };

  return {
    pages,
    columns: {
      history: findHeaderX('HISTORICO', 115),
      document: findHeaderX('DOCTO', 315),
      credit: findHeaderX('CREDITO', 420),
      debit: findHeaderX('DEBITO', 500),
      balance: findHeaderX('SALDO', 575),
    },
  };
}

function parseStatementRows(pages, columns) {
  const parsed = [];
  let currentDate = '';
  let lastTransaction = null;
  let pendingDescription = [];

  const moneyRegex = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  const isMetadata = (line) => /^(BRADESCO|DATA:|NOME:|EXTRATO DE:|FOLHA:|DATA\s+HIST|HISTORICO|CR[EÉ]DITO|D[EÉ]BITO|SALDO|TOTAL\b)/i.test(line);
  const nearestColumn = (x) => {
    const candidates = [
      { name: 'credit', x: columns.credit },
      { name: 'debit', x: columns.debit },
      { name: 'balance', x: columns.balance },
    ];
    return candidates.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0].name;
  };

  const getHistoryText = (row) => normalizeText(row.items
    .filter(item => item.x >= columns.history - 10 && item.x < columns.document - 8)
    .map(item => item.str.replace(moneyRegex, ''))
    .filter(part => !/^\d{2}\/\d{2}\/\d{4}$/.test(part.trim()) && normalizeText(part))
    .join(' '));

  const getAmountInfo = (row) => {
    const line = normalizeText(row.items.map(item => item.str).join(' '));
    const itemMoney = [];
    row.items.forEach(item => {
      const matches = String(item.str || '').match(moneyRegex) || [];
      matches.forEach(value => itemMoney.push({ x: item.x, value }));
    });

    const creditItem = itemMoney.find(item => nearestColumn(item.x) === 'credit');
    const debitItem = itemMoney.find(item => nearestColumn(item.x) === 'debit');
    let credit = creditItem ? parseBrl(creditItem.value) : 0;
    let debit = debitItem ? parseBrl(debitItem.value) : 0;

    if (credit === 0 && debit === 0) {
      const lineMoney = line.match(moneyRegex) || [];
      if (lineMoney.length >= 2) {
        const amountText = lineMoney[lineMoney.length - 2];
        const amount = parseBrl(amountText);
        const amountX = itemMoney.find(item => item.value === amountText)?.x || columns.debit;
        if (nearestColumn(amountX) === 'credit') credit = amount;
        else debit = amount;
      }
    }

    return { credit, debit, hasAmount: credit > 0 || debit > 0 };
  };

  for (const rows of pages) {
    pendingDescription = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = normalizeText(row.items.map(item => item.str).join(' '));
      if (!line || isMetadata(line)) continue;

      const dateItem = row.items.find(item => /^\d{2}\/\d{2}\/\d{4}$/.test(item.str));
      if (dateItem) currentDate = parseDateBr(dateItem.str);

      const historyText = getHistoryText(row);
      const { credit, debit, hasAmount } = getAmountInfo(row);

      if (hasAmount && currentDate) {
        const description = normalizeText(historyText || pendingDescription.join(' '));
        const normalizedDescription = compact(description);
        pendingDescription = [];

        if (!description || normalizedDescription.includes('CODLANC') || normalizedDescription === 'TOTAL') continue;

        lastTransaction = {
          id: `pdf-${parsed.length}`,
          date: currentDate,
          description,
          amount: credit > 0 ? credit : debit,
          type: credit > 0 ? 'income' : 'expense',
          raw: row.items.map(item => item.str),
        };
        parsed.push(lastTransaction);
        continue;
      }

      if (!historyText || compact(historyText).includes('CODLANC')) continue;

      const nextHasAmount = rows[i + 1] ? getAmountInfo(rows[i + 1]).hasAmount : false;
      const looksLikeDetail = /^(REM:|DES:|CONTR|BRADESCO|EMBASA|NEOENERGIA|LTIMA|FATURA|PAGTO\s+FATURA|PORTO\s+)/i.test(historyText);

      if (lastTransaction && pendingDescription.length === 0 && (looksLikeDetail || !nextHasAmount)) {
        lastTransaction.description = normalizeText(`${lastTransaction.description} ${historyText}`);
        lastTransaction.raw.push(historyText);
      } else {
        pendingDescription = [historyText];
      }
    }
  }

  return parsed;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { buffer, debug } = await getPayload(req);
    const { pages, columns } = await extractRowsFromPdf(buffer);
    const rows = parseStatementRows(pages, columns);

    if (debug) {
      return Response.json({
        columns,
        page_rows: pages.map(page => page.slice(0, 30).map(row => ({
          y: row.y,
          line: row.items.map(item => `[${Math.round(item.x)}]${item.str}`).join(' | '),
        }))),
        rows,
        count: rows.length,
      });
    }

    return Response.json({ rows, count: rows.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});