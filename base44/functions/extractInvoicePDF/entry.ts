import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um extrator de dados financeiros especializado em faturas de cartão de crédito brasileiro.

MISSÃO: Ler o PDF da fatura abaixo e extrair ABSOLUTAMENTE TODOS os lançamentos com valor positivo.

REGRAS CRÍTICAS DE INCLUSÃO — inclua TUDO que tiver valor:
- Compras normais (Mercado, Restaurante, etc.)
- Uber, 99, transporte por app — SEMPRE incluir, mesmo que "Uber *TRIP" ou "Uber HELP.US"
- IOF, taxas internacionais, encargos — SEMPRE incluir como "impostos"
- Mensalidades, assinaturas, planos (mesmo que descrição seja incompleta como "Mensalidade - Plano do")
- Apps e serviços (Adapta, CapCut, Google, etc.) — SEMPRE incluir
- Compras parceladas — incluir cada parcela que aparece na fatura como item separado
- Qualquer linha que tenha um valor em reais (R$, vírgula decimal)

REGRA ABSOLUTA DE ESTORNOS E CRÉDITOS — NUNCA IGNORE:
- Estornos, cancelamentos de compra, devoluções → extrair com amount NEGATIVO (ex: -142.52)
- "Pagamento efetuado", "crédito de fatura", "estorno parcial" → extrair com amount NEGATIVO
- Qualquer linha com sinal de crédito (-), "(C)" ou indicador de devolução → amount NEGATIVO
- Você DEVE incluir 100% dessas linhas. Omiti-las causará erro contábil grave.

REGRAS DE EXCLUSÃO — NÃO incluir APENAS:
- Total da fatura / valor total a pagar (linha de rodapé)
- Saldo anterior / limite de crédito / limite disponível

REGRA CRÍTICA DE DATAS E PARCELAS:

1. INÍCIO DA LINHA (DD/MM) = DATA REAL DA COMPRA
  - Exemplo: Linha começa com "09/12 ADAPTAORG 150,00" → data = 09/12 (ano inferido)
 
2. FIM DA DESCRIÇÃO (XX/YY) = PARCELA
  - Exemplo: "ADAPTAORG 09/12" no fim da descrição → parcela 09 de 12
  - Isso NÃO é uma data, é um identificador de parcelamento
  - Extrair como: installment_number=9, installment_total=12

3. INFERÊNCIA DE ANO:
  - Se ref_month="${ref_month}" e data extraída > ${ref_month.split('-')[1]} → ano ${parseInt(ref_month.split('-')[0]) - 1} (compra mês anterior)
  - Se ref_month="${ref_month}" e data extraída <= ${ref_month.split('-')[1]} → ano ${ref_month.split('-')[0]} (compra mês atual)

CAMPOS DO JSON:
- description: Texto EXATO da descrição (SEM data no início, SEM parcela no fim)
- amount: Número decimal. POSITIVO para compras/débitos, NEGATIVO para estornos/créditos/cancelamentos
- date: Data da COMPRA em YYYY-MM-DD (extraída do início da linha, com ano inferido)
- installment_number: Número da parcela (se houver XX/YY no fim da descrição)
- installment_total: Total de parcelas (se houver XX/YY no fim da descrição)
- category: Use padrões abaixo como fallback
- invoice_total: Valor TOTAL da fatura (extraído uma única vez do documento, ex: "TOTAL A PAGAR: R$ 5.432,10")

CATEGORIAS PADRÃO (fallback):
 * "transporte": UBER, 99, CABIFY, POSTO, SHELL, IPIRANGA, PETROBRAS, COMBUSTIVEL, LATAM, GOL, AZUL, PASSAGEM
 * "servicos": GOOGLE, APPLE, CAPCUT, NETFLIX, SPOTIFY, AMAZON, YOUTUBE, DISNEY, PARAMOUNT, HBO, ADAPTA
 * "saude": FARMACIA, DROGARIA, PAGUE MENOS, ULTRAFARMA, HOSPITAL, CLINICA, LABORATORIO, PLANO, MENSALIDADE
 * "alimentacao": MERCADO, SUPERMERCADO, CARREFOUR, ATAKADAO, HIPERIDEAL, IFOOD, RAPPI, RESTAURANTE, LANCHONETE, PADARIA
 * "educacao": ESCOLA, UNIVERSIDADE, CURSO, UDEMY, ALURA, FACULDADE
 * "impostos": IOF, TAXA, IMPOSTO, ENCARGO, MULTA, JUROS
 * "lazer": HOTEL, AIRBNB, CINEMA, TEATRO, SHOW, INGRESSO, BOOKING
 * "vestuario": ROUPA, CALCADO, ZARA, RENNER, RIACHUELO
 * "moradia": ALUGUEL, CONDOMINIO, ENERGIA, AGUA, GAS, INTERNET, TELEFONE
 * "outros": SOMENTE se não se encaixar em nenhuma categoria acima

Retorne JSON com array "items". Se não encontrar nenhum item, retorne {"items": []}.`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                amount: { type: 'number' },
                date: { type: 'string' },
                category: { type: 'string' },
                installment_number: { type: 'number' },
                installment_total: { type: 'number' },
              },
              required: ['description', 'amount', 'date', 'category'],
            },
          },
          invoice_total: { type: 'number' },
        },
        required: ['items'],
      },
    });

    const items = (result?.items || []).map(item => {
      let desc = sanitizeDescription(item.description);
      const inst = item.installment_number && item.installment_total ?
        { number: item.installment_number, total: item.installment_total } :
        extractInstallment(desc);
    
      if (inst) {
        desc = removeInstallmentPattern(desc, inst);
      }

      const rawAmount = parseFloat(item.amount) || 0;
      return {
        description: desc,
        amount: rawAmount, 
        date: item.date || ref_month + '-01',
        category: item.category || 'outros',
        installment_number: inst ? inst.number : null,
        installment_total: inst ? inst.total : null,
      };
    }).filter(item => item.amount !== 0);

    const totalExtracted = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const invoiceTotal = result?.invoice_total || totalExtracted;
    const diff = Math.abs(invoiceTotal - totalExtracted);
    const isConsistent = diff < 0.05;

    return Response.json({
      items,
      integrity_check: {
        is_consistent: isConsistent,
        total_extracted: totalExtracted,
        invoice_total: invoiceTotal,
        diff: diff,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});