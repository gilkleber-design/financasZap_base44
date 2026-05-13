import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as pdfjsLib from 'npm:pdfjs-dist@4.9.155/legacy/build/pdf.mjs';

// Desabilita worker (não suportado em Deno)
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// Limpa sufixos geográficos e de adquirentes inseridos pelos bancos
function sanitizeDescription(desc) {
  if (!desc) return desc;
  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i,
    /\s*SALVADOR\s*BRA?$/i,
    /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i,
    /\s*RIO DE JANEIRO\s*BRA?$/i,
    /\s*BELO HORIZONTE\s*BRA?$/i,
    /\s*BRASILIA\s*BRA?$/i,
    /\s*FORTALEZA\s*BRA?$/i,
    /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i,
    /\s*PORTO ALEGRE\s*BRA?$/i,
    /[A-Z]{3,}BRA$/,
    /[A-Z]{3,}BR$/,
    /\s+BRA$/i,
    /\s+BR$/i,
  ];
  let cleaned = desc.trim();
  for (const re of geoSuffixes) {
    cleaned = cleaned.replace(re, '').trim();
  }
  return cleaned;
}

// Extrai parcela apenas quando o padrão NÃO é uma data
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

// Remove o padrão de parcela da descrição
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

// Extrai texto de todas as páginas do PDF
async function extractTextFromPDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join('\n');
    pages.push(pageText);
  }
  return pages.join('\n');
}

// Inferência de ano com base no mês de referência
function inferYear(day, month, refMonth) {
  const [refYear, refMon] = refMonth.split('-').map(Number);
  // Se o mês da compra é maior que o mês de referência, é do ano anterior
  if (month > refMon) return refYear - 1;
  return refYear;
}

// Categorização automática por keyword
function categorizeByKeyword(desc) {
  const d = desc.toUpperCase();
  if (/UBER|99|CABIFY|POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUSTIVEL|LATAM|GOL|AZUL|PASSAGEM/.test(d)) return 'transporte';
  if (/GOOGLE|APPLE|CAPCUT|NETFLIX|SPOTIFY|AMAZON|YOUTUBE|DISNEY|PARAMOUNT|HBO|ADAPTA/.test(d)) return 'servicos';
  if (/FARMACIA|DROGARIA|PAGUE MENOS|ULTRAFARMA|HOSPITAL|CLINICA|LABORATORIO|PLANO|MENSALIDADE/.test(d)) return 'saude';
  if (/MERCADO|SUPERMERCADO|CARREFOUR|ATAKADAO|HIPERIDEAL|IFOOD|RAPPI|RESTAURANTE|LANCHONETE|PADARIA/.test(d)) return 'alimentacao';
  if (/ESCOLA|UNIVERSIDADE|CURSO|UDEMY|ALURA|FACULDADE/.test(d)) return 'educacao';
  if (/IOF|TAXA|IMPOSTO|ENCARGO|MULTA|JUROS/.test(d)) return 'impostos';
  if (/HOTEL|AIRBNB|CINEMA|TEATRO|SHOW|INGRESSO|BOOKING/.test(d)) return 'lazer';
  if (/ROUPA|CALCADO|ZARA|RENNER|RIACHUELO/.test(d)) return 'vestuario';
  if (/ALUGUEL|CONDOMINIO|ENERGIA|AGUA|GAS|INTERNET|TELEFONE/.test(d)) return 'moradia';
  return 'outros';
}

// Parser Itaú
function parseItau(fullText, refMonth) {
  const items = [];
  let invoiceTotal = 0;

  const totalMatch = fullText.match(/TOTAL A PAGAR\s*R\$\s*([\d.,]+)/i);
  if (totalMatch) invoiceTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));

  // Padrão principal do Itaú: linha com data no início DD/MM + descrição + valor (com sinal ou sem)
  // Exemplos: "15/04 UBER *TRIP 54,90"  ou  "20/04 ESTORNO COMPRA -142,52"
  const regexItau = /(\d{2})\/(\d{2})\s+(.+?)\s{2,}([+-]?\s*[\d.,]+)\s*(?:\n|$)/gm;
  let match;

  while ((match = regexItau.exec(fullText)) !== null) {
    const day = match[1];
    const mon = parseInt(match[2]);
    const rawDesc = match[3].trim();
    const rawValue = match[4].replace(/\s/g, '');

    if (rawDesc.toLowerCase().includes('pagamento')) continue;
    if (rawDesc.toLowerCase().includes('total a pagar')) continue;
    if (rawDesc.toLowerCase().includes('saldo anterior')) continue;

    const absValue = parseFloat(rawValue.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!absValue || absValue === 0) continue;

    // Sinal: "-" no rawValue = crédito/estorno, sem sinal ou "+" = débito
    const isCredit = rawValue.startsWith('-');
    const amount = isCredit ? -absValue : absValue;

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    // Download do PDF
    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) throw new Error(`Falha ao baixar PDF: ${pdfResponse.status}`);
    const arrayBuffer = await pdfResponse.arrayBuffer();

    // Extração de texto via pdfjs-dist
    const fullText = await extractTextFromPDF(arrayBuffer);

    if (!fullText || fullText.trim().length < 50) {
      throw new Error('Não foi possível extrair texto do PDF. Verifique se o arquivo não é uma imagem escaneada.');
    }

    // Detecta banco e aplica parser correspondente
    let items = [];
    let invoiceTotal = 0;

    if (fullText.includes('Itaú') || fullText.includes('ITAU') || fullText.includes('itau')) {
      const result = parseItau(fullText, ref_month);
      items = result.items;
      invoiceTotal = result.invoiceTotal;
    } else {
      throw new Error('Padrão de fatura não reconhecido. Banco não homologado. Contate o suporte para adicionar suporte à sua fatura.');
    }

    const totalExtracted = items.reduce((sum, item) => sum + item.amount, 0);
    const finalTotal = invoiceTotal || totalExtracted;

    return Response.json({
      items,
      integrity_check: {
        is_consistent: Math.abs(finalTotal - totalExtracted) < 0.1,
        total_extracted: totalExtracted,
        invoice_total: finalTotal,
        diff: Math.abs(finalTotal - totalExtracted),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});