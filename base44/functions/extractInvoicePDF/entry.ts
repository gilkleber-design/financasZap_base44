import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Itaú PDF parser — trabalha com texto condensado do Gemini ──────────────

// Padrão Itaú condensado: "DD/MM ESTABELECIMENTO [XX/YY] VALOR CATEGORIA CIDADE"
// Ex: "04/04 POSTO PARALELA ISALVADO 284,70 outros SALVADOR"
// Ex: "25/08 AdaptaOrg 09/12 99,00 educacao Sao Paulo"

function parseItauText(text) {
  const items = [];

  // Regex principal: data + descrição + opcional parcela + valor
  // Captura: date(DD/MM) | desc | [parcela XX/YY] | amount
  const lineRe = /(\d{2}\/\d{2})\s+(.+?)\s+(?:(\d{2})\/(\d{2})\s+)?([\d.]+,\d{2})/g;

  let match;
  while ((match = lineRe.exec(text)) !== null) {
    const [, date, rawDesc, instNum, instTotal, rawAmount] = match;

    // Ignora linhas de totais/resumo
    const descLower = rawDesc.toLowerCase();
    if (
      descLower.includes('pagamento') ||
      descLower.includes('total') ||
      descLower.includes('saldo') ||
      descLower.includes('fatura anterior') ||
      descLower.includes('vencimento') ||
      descLower.includes('postagem') ||
      descLower.includes('emissão') ||
      descLower.includes('fechamento') ||
      descLower.includes('previsão')
    ) continue;

    const amount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount === 0) continue;

    // Detecta se é negativo (pagamento/estorno) pelo contexto
    // O Itaú não coloca sinal, mas "PAGAMENTO" já é filtrado acima
    // Estornos têm "-" antes do valor no PDF, mas o Gemini pode não preservar
    const isNegative = text.includes(`-${rawAmount}`) && 
      text.indexOf(`-${rawAmount}`) === match.index + match[0].indexOf(rawAmount) - 1;

    // Extrai categoria do texto após o valor (próximos ~50 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 60);
    const category = extractCategory(rawDesc + ' ' + afterMatch);

    // Detecta parcela: pode vir no rawDesc "AdaptaOrg 09/12" ou nos grupos capturados
    let installNumber = instNum ? parseInt(instNum, 10) : null;
    let installTotal = instTotal ? parseInt(instTotal, 10) : null;
    let cleanDesc = rawDesc.trim();

    // Tenta também parcela embutida na descrição
    if (!installNumber) {
      const embeddedInstall = cleanDesc.match(/\s+(\d{2})\/(\d{2})\s*$/);
      if (embeddedInstall) {
        installNumber = parseInt(embeddedInstall[1], 10);
        installTotal  = parseInt(embeddedInstall[2], 10);
        cleanDesc = cleanDesc.replace(/\s+\d{2}\/\d{2}\s*$/, '').trim();
      }
    }

    cleanDesc = sanitizeDesc(cleanDesc);

    const [day, month] = date.split('/');
    items.push({
      date_day: day,
      date_month: month,
      description: cleanDesc,
      amount: isNegative ? -amount : amount,
      category,
      installment_number: installNumber,
      installment_total: installTotal,
    });
  }

  return items;
}

function sanitizeDesc(desc) {
  if (!desc) return desc;
  // Remove sufixo cidade colado (Itaú trunca nome em ~23 chars e cola cidade no final)
  let c = desc
    .replace(/\s*(SAO PAULO|SALVADOR|GUARULHOS|CURITIBA|BARRETOS|CAMACARI|ITUPEVA|CORUMBATAI|LAURO DE FRE|SANTA BARBARA|BARRETO)[A-Z\s]*$/i, '')
    .trim();
  c = c.replace(/\s+BRA?$/i, '').trim();
  // Remove sufixo colado sem espaço (ex: "ISALVADO" → "I", "DSALVADO" → "D")
  // Padrão: palavra que termina com cidade colada sem espaço
  c = c.replace(/(SALVA?DO?R?|SAOPAULO|GUARULH|CURITIB|BARRET|CAMACA)[A-Z]*$/i, '').trim();
  // Une letras isoladas: "G I L" → "GIL"  
  c = c.replace(/\b([A-Z])\s(?=[A-Z][\s$])/g, '$1');
  // DL * → DL*
  c = c.replace(/DL\s+\*/g, 'DL*');
  return c;
}

function extractCategory(text) {
  if (!text) return 'outros';
  const t = text.toLowerCase();
  if (t.includes('transporte') || t.includes('uber') || t.includes('posto')) return 'transporte';
  if (t.includes('alimenta') || t.includes('supermercado') || t.includes('restaurante') || t.includes('hortifruti') || t.includes('lanche')) return 'alimentacao';
  if (t.includes('saúde') || t.includes('saude') || t.includes('drogaria') || t.includes('farmácia') || t.includes('raia')) return 'saude';
  if (t.includes('educa')) return 'educacao';
  if (t.includes('lazer') || t.includes('zig')) return 'lazer';
  if (t.includes('vestuár') || t.includes('vestuario') || t.includes('roupa')) return 'vestuario';
  if (t.includes('serviç') || t.includes('servicos') || t.includes('serviços')) return 'servicos';
  return 'outros';
}

// ─── Handler principal ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    // Extrai texto bruto do PDF via Gemini (retorna markdown/texto condensado)
    const rawText = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      prompt: `Extraia o texto deste PDF de fatura de cartão de crédito Itaú exatamente como está, preservando datas, nomes de estabelecimentos, valores e categorias. Retorne como texto simples, cada informação separada por espaço na mesma linha. Formato esperado por transação: DD/MM ESTABELECIMENTO VALOR categoria CIDADE`,
      file_urls: [file_url],
    });

    const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText);

    // Parse baseado em regras
    const parsed = parseItauText(text);

    // Resolve ano: ref_month vem como "YYYY-MM"
    const [refYear, refMonthNum] = ref_month.split('-').map(Number);

    const items = parsed.map(item => {
      const itemMonth = parseInt(item.date_month, 10);
      // Se mês do item > mês de referência, é do ano anterior (ex: compra em dez para fatura de jan)
      let year = refYear;
      if (itemMonth > refMonthNum) year = refYear - 1;

      const dateStr = `${year}-${item.date_month.padStart(2,'0')}-${item.date_day.padStart(2,'0')}`;

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

    return Response.json({ 
      items, 
      integrity_check: { invoice_total: Math.round(invoice_total * 100) / 100 }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});