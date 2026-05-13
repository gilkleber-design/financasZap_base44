import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as pdfjsLib from 'npm:pdfjs-dist@4.9.155/legacy/build/pdf.mjs';

// ─── Helpers de limpeza ─────────────────────────────────────────────────────

function sanitizeDescription(desc) {
  if (!desc) return desc;
  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i, /\s*RIO DE JANEIRO\s*BRA?$/i,
    /\s*BELO HORIZONTE\s*BRA?$/i, /\s*BRASILIA\s*BRA?$/i,
    /\s*FORTALEZA\s*BRA?$/i, /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i, /\s*PORTO ALEGRE\s*BRA?$/i,
    /[A-Z]{3,}BRA$/, /[A-Z]{3,}BR$/, /\s+BRA$/i, /\s+BR$/i,
  ];
  let cleaned = desc.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

function extractInstallment(description) {
  const parenMatch = description.match(/\((\d{1,2})\/(\d{1,2})\)/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1]);
    const total = parseInt(parenMatch[2]);
    if (num <= total && total > 1) return { number: num, total };
  }
  const endMatch = description.match(/\s(\d{1,2})\/(\d{2})\s*$/);
  if (endMatch) {
    const num = parseInt(endMatch[1]);
    const total = parseInt(endMatch[2]);
    if (num <= total && total > 1 && total <= 72) return { number: num, total };
  }
  return null;
}

function removeInstallmentPattern(description, inst) {
  let result = description.replace(/\s*\(\d{1,2}\/\d{1,2}\)\s*/g, ' ');
  if (inst) {
    const endPat = new RegExp(`\\s${inst.number}/${String(inst.total).padStart(2,'0')}\\s*$`);
    result = result.replace(endPat, '');
    const endPat2 = new RegExp(`\\s0?${inst.number}/${String(inst.total).padStart(2,'0')}\\s*$`);
    result = result.replace(endPat2, '');
  }
  return result.trim();
}

// Remove espaços espúrios dentro de palavras e números (artefato do PDF do Itaú)
function normalizeSpaces(str) {
  // Remove espaços dentro de números: "10.249 ,61" → "10.249,61", "6.354 ,10" → "6.354,10"
  let s = str.replace(/(\d)\s+[,.](\d)/g, '$1,$2');
  s = s.replace(/(\d)\s+(\d{3})/g, '$1$2');
  // Colapsa múltiplos espaços
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

function categorizeByKeyword(desc) {
  const d = desc.toUpperCase();
  if (/UBER|99APP|99 |CABIFY|POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUSTIVEL|LATAM|GOL|AZUL|PASSAGEM/.test(d)) return 'transporte';
  if (/GOOGLE|APPLE|CAPCUT|NETFLIX|SPOTIFY|AMAZON|YOUTUBE|DISNEY|PARAMOUNT|HBO|ADAPTA/.test(d)) return 'servicos';
  if (/FARMACIA|DROGARIA|RAIA|PAGUE MENOS|ULTRAFARMA|HOSPITAL|CLINICA|LABORATORIO|PLANO|MENSALIDADE/.test(d)) return 'saude';
  if (/MERCADO|SUPERMERCADO|CARREFOUR|ATAKADAO|HIPERIDEAL|IFOOD|RAPPI|RESTAURANTE|LANCHONETE|PADARIA/.test(d)) return 'alimentacao';
  if (/ESCOLA|UNIVERSIDADE|CURSO|UDEMY|ALURA|FACULDADE/.test(d)) return 'educacao';
  if (/IOF|TAXA|IMPOSTO|ENCARGO|MULTA|JUROS/.test(d)) return 'impostos';
  if (/HOTEL|AIRBNB|CINEMA|TEATRO|SHOW|INGRESSO|BOOKING/.test(d)) return 'lazer';
  if (/ROUPA|CALCADO|ZARA|RENNER|RIACHUELO/.test(d)) return 'vestuario';
  if (/ALUGUEL|CONDOMINIO|ENERGIA|AGUA|GAS|INTERNET|TELEFONE/.test(d)) return 'moradia';
  return 'outros';
}

// ─── Extração por LINHAS (agrupa tokens pela posição Y) ───────────────────────
// O Itaú tem um PDF com texto fragmentado — cada palavra ou sílaba pode ser um
// token separado. Agrupamos todos os tokens da mesma linha (mesmo Y arredondado)
// e depois processamos linha por linha.

async function extractLinesFromPDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableWorker: true,
    workerSrc: '',
  });
  const pdfDoc = await loadingTask.promise;
  const allLines = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();

    // Agrupa tokens por Y (arredondado a 1 casa decimal para tolerar sub-pixel)
    const byY = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: item.transform[4], str: item.str });
    }

    // Ordena por Y decrescente (topo da página primeiro) e depois X crescente
    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const tokens = byY.get(y).sort((a, b) => a.x - b.x);
      // Junta simplesmente com espaço — depois normalizamos as descrições
      const line = tokens.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}

// ─── Parser de números brasileiros ───────────────────────────────────────────
function parseBRL(str) {
  // Remove tudo exceto dígitos, ponto e vírgula — depois normaliza
  const clean = str.replace(/[^\d.,]/g, '');
  // Formato brasileiro: 1.234,56 → 1234.56
  return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
}

// ─── Parser Itaú ─────────────────────────────────────────────────────────────
function inferYear(day, month, refMonth) {
  const [refYear, refMon] = refMonth.split('-').map(Number);
  return month > refMon ? refYear - 1 : refYear;
}

function parseItau(lines, refMonth) {
  const items = [];
  let invoiceTotal = 0;

  // Regex de data: DD/MM no início da linha (com possíveis espaços internos)
  // Ex: "12/01", "25/08"
  const dateRe = /^(\d{2})\s*\/\s*(\d{2})\s+(.+)$/;

  // Regex de valor no final da linha (positivo ou negativo)
  // Cobre: "6.354,10", "-10.249,61", "99,00"
  const valueRe = /(-?\s*[\d]+(?:[.,][\d]{3})*[.,]\d{2})\s*$/;

  for (const rawLine of lines) {
    const line = normalizeSpaces(rawLine);
    // Total da fatura
    if (/total\s*a\s*pagar/i.test(line)) {
      const m = line.match(/R\$\s*([\d.,]+)/i);
      if (m) invoiceTotal = parseBRL(m[1]);
      continue;
    }

    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const mon = parseInt(dateMatch[2]);
    const rest = dateMatch[3].trim();

    // Ignora linhas de pagamento
    if (/pagamento/i.test(rest)) continue;
    if (/saldo\s*anterior/i.test(rest)) continue;
    if (/total\s*dos\s*pagamentos/i.test(rest)) continue;
    if (/limite/i.test(rest)) continue;

    // Extrai valor do final
    const valMatch = rest.match(valueRe);
    if (!valMatch) continue;

    const rawVal = valMatch[1].replace(/\s/g, '');
    const absValue = parseBRL(rawVal);
    if (!absValue || absValue === 0) continue;

    const isCredit = rawVal.startsWith('-');
    const amount = isCredit ? -absValue : absValue;

    // Descrição = tudo entre a data e o valor
    let rawDesc = rest.slice(0, rest.length - valMatch[0].length).trim();
    // Remove sufixo de categoria que o Itaú coloca (ex: "outros SALVADOR", "saúde SALVADOR")
    rawDesc = rawDesc.replace(/\s+(outros|saúde|saude|transporte|alimentacao|alimentação|educacao|educação|lazer|moradia|serviços|servicos|vestuario|vestuário|impostos)\s+\S+\s*$/i, '').trim();
    rawDesc = rawDesc.replace(/\s+(outros|saúde|saude|transporte|alimentacao|alimentação|educacao|educação|lazer|moradia|serviços|servicos|vestuario|vestuário|impostos)\s*$/i, '').trim();

    if (!rawDesc) continue;

    const year = inferYear(parseInt(day), mon, refMonth);
    const dateStr = `${year}-${String(mon).padStart(2,'0')}-${day}`;

    let cleanDesc = sanitizeDescription(rawDesc);
    const inst = extractInstallment(cleanDesc);
    if (inst) cleanDesc = removeInstallmentPattern(cleanDesc, inst);

    items.push({
      description: cleanDesc,
      amount,
      date: dateStr,
      category: categorizeByKeyword(cleanDesc),
      installment_number: inst ? inst.number : null,
      installment_total: inst ? inst.total : null,
    });
  }

  return { items, invoiceTotal };
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month, debug } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) throw new Error(`Falha ao baixar PDF: ${pdfResponse.status}`);
    const arrayBuffer = await pdfResponse.arrayBuffer();

    const lines = await extractLinesFromPDF(arrayBuffer);

    if (!lines || lines.length < 5) {
      throw new Error('Não foi possível extrair texto do PDF. Verifique se o arquivo não é uma imagem escaneada.');
    }

    if (debug) return Response.json({ debug_lines: lines });

    let items = [];
    let invoiceTotal = 0;

    const fullText = lines.join('\n');
    if (fullText.includes('Itaú') || fullText.includes('ITAU') || fullText.includes('itau') || fullText.includes('Ita ú')) {
      const result = parseItau(lines, ref_month);
      items = result.items;
      invoiceTotal = result.invoiceTotal;
    } else {
      throw new Error('Padrão de fatura não reconhecido. Banco não homologado.');
    }

    const totalExtracted = items.reduce((sum, item) => sum + item.amount, 0);
    const finalTotal = invoiceTotal || totalExtracted;

    return Response.json({
      items,
      integrity_check: {
        is_consistent: Math.abs(finalTotal - totalExtracted) < 0.5,
        total_extracted: totalExtracted,
        invoice_total: finalTotal,
        diff: Math.abs(finalTotal - totalExtracted),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});