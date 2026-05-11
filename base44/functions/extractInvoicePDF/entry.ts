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

// Extrai parcela apenas quando o padrão NÃO é uma data (DD/MM ou MM/YYYY)
// Parcela: ex "03/12", "05/12" onde está entre parênteses ou após espaço no meio da string
// Datas de vencimento/compra: geralmente no início da linha ou formato DD/MM/YYYY
function extractInstallment(description) {
  // Parcela está geralmente entre parênteses ou no final: (03/12), " 03/12"
  // Evitar confundir com datas do tipo "25/08" que são datas de compra no início
  
  // Padrão 1: entre parênteses — quase certamente parcela
  const parenMatch = description.match(/\((\d{1,2})\/(\d{1,2})\)/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1]);
    const total = parseInt(parenMatch[2]);
    if (num <= total && total > 1) return { number: num, total };
  }

  // Padrão 2: no final da string após espaço — provável parcela
  // Mas só se o número da parcela for plausível (num < total e total <= 72)
  const endMatch = description.match(/\s(\d{1,2})\/(\d{2})\s*$/);
  if (endMatch) {
    const num = parseInt(endMatch[1]);
    const total = parseInt(endMatch[2]);
    if (num <= total && total > 1 && total <= 72) return { number: num, total };
  }

  return null;
}

// Remove o padrão de parcela da descrição (entre parênteses ou no final)
function removeInstallmentPattern(description, inst) {
  // Remove padrão entre parênteses
  let result = description.replace(/\s*\(\d{1,2}\/\d{1,2}\)\s*/g, ' ');
  // Remove padrão no final (somente se for igual ao que extraímos)
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

    // Passo 1: transcrição literal e completa do PDF
    const textResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um leitor de PDFs. Sua única função é transcrever FIELMENTE e COMPLETAMENTE o PDF de fatura de cartão de crédito abaixo.

REGRAS ABSOLUTAS:
- Transcreva CADA linha do PDF, sem omitir nenhuma
- Preserve exatamente os textos, incluindo padrões como "03/12", "(03/12)", "05/12" — estes são números de parcelas
- Inclua TODAS as linhas: compras, IOF, taxas, encargos, mensalidades, assinaturas, Uber, qualquer coisa com valor
- NÃO filtre, NÃO interprete, NÃO resuma — apenas transcreva linha a linha
- Se uma linha tem descrição e valor, transcreva os dois juntos
- Preserve datas no início das linhas (ex: "25/08", "03/08")

Transcreva o PDF completo abaixo:`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
    });

    // Passo 2: extração estruturada a partir do texto
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um extrator de dados financeiros especializado em faturas de cartão de crédito brasileiro.

TEXTO TRANSCRITO DA FATURA:
---
${textResult}
---

MISSÃO: Extrair ABSOLUTAMENTE TODOS os lançamentos com valor positivo.

REGRAS CRÍTICAS DE INCLUSÃO — inclua TUDO que tiver valor:
- Compras normais (Mercado, Restaurante, etc.)
- Uber, 99, transporte por app — SEMPRE incluir, mesmo que "Uber *TRIP" ou "Uber HELP.US"
- IOF, taxas internacionais, encargos — SEMPRE incluir como "impostos"
- Mensalidades, assinaturas, planos (mesmo que descrição seja incompleta como "Mensalidade - Plano do")
- Apps e serviços (Adapta, CapCut, Google, etc.) — SEMPRE incluir
- Compras parceladas — incluir cada parcela que aparece na fatura como item separado
- Qualquer linha que tenha um valor em reais (R$, vírgula decimal)

REGRAS DE EXCLUSÃO — NÃO incluir:
- Total da fatura / valor total a pagar
- Saldo anterior / pagamento anterior de fatura
- Limite de crédito / limite disponível
- Valores negativos (estornos)

IMPORTANTE: Você DEVE extrair a data real do início de cada linha (padrão DD/MM, ex: 26/12, 04/12).
Se a linha começa com DD/MM, essa é a data real da compra.
INFIRA o ano com base no ref_month: se ref_month é "2026-05", use ano 2025 para datas > 05/31 (compras do mês anterior) e 2026 para datas <= 05/31.

CAMPOS:
- description: Texto EXATO da descrição, sem data
- amount: Número decimal (sempre positivo)
- date: Data da COMPRA em YYYY-MM-DD (extraída do início da linha, com ano inferido)
- category: Use regras de CategoryRule (ver banco de dados) ou padrões abaixo como fallback

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
              },
              required: ['description', 'amount', 'date', 'category'],
            },
          },
        },
        required: ['items'],
      },
    });

    // Passo 3: pós-processamento
    const items = (result?.items || []).map(item => {
      let desc = sanitizeDescription(item.description);
      const inst = extractInstallment(desc);
      if (inst) {
        desc = removeInstallmentPattern(desc, inst);
      }

      return {
        description: desc,
        amount: Math.abs(parseFloat(item.amount) || 0),
        date: item.date || ref_month + '-01',
        category: item.category || 'outros',
        installment_number: inst ? inst.number : null,
        installment_total: inst ? inst.total : null,
      };
    }).filter(item => item.amount > 0);

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});