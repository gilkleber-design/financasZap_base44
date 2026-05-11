import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Limpa sufixos geográficos e de adquirentes inseridos pelos bancos
function sanitizeDescription(desc) {
  if (!desc) return desc;

  // Remove sufixos geográficos colados no final (ex: SALVADORBRA, SAO PAULOBRA, CURITIBABR)
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
    // Padrão genérico: palavra colada + BRA ou BR no final
    /[A-Z]{3,}BRA$/,
    /[A-Z]{3,}BR$/,
    // Sufixo de país sozinho
    /\s+BRA$/i,
    /\s+BR$/i,
  ];

  let cleaned = desc.trim();
  for (const re of geoSuffixes) {
    cleaned = cleaned.replace(re, '').trim();
  }

  return cleaned;
}

// Extrai parcela da descrição: padrão XX/YY (ex: 01/04, 02/10)
function extractInstallment(description) {
  // Padrão principal: números separados por barra (ex: 01/04, 2/10, 02/12)
  const match = description.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (match) {
    const num = parseInt(match[1]);
    const total = parseInt(match[2]);
    // Validação: parcela atual deve ser <= total e total > 1
    if (num <= total && total > 1) {
      return { number: num, total };
    }
  }
  return null;
}

// Remove o padrão de parcela da descrição após extração
function removeInstallmentPattern(description) {
  return description.replace(/\s*\b\d{1,2}\/\d{1,2}\b\s*/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    // Passo 1: transcreve o texto bruto do PDF
    const textResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Leia este PDF de fatura de cartão de crédito brasileiro e transcreva LITERALMENTE todo o texto visível, especialmente todas as linhas com datas, descrições de compras e valores. Não interprete, apenas transcreva linha por linha. Preserve exatamente os textos das descrições, incluindo padrões como XX/YY que indicam parcelas.`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
    });

    // Passo 2: estrutura os dados a partir do texto
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente financeiro especializado em faturas de cartão de crédito brasileiro.

Analise o texto abaixo e extraia os lançamentos conforme as regras.

TEXTO DA FATURA:
${textResult}

REGRAS DE EXTRAÇÃO:
- Extraia TODOS os lançamentos de compras
- Preserve o texto original da descrição, incluindo padrões como "01/04", "02/10" (indicam parcelas)
- Inclua também linhas de IOF, taxas internacionais e encargos de transações (categorie como "impostos")
- NÃO inclua: total da fatura, subtotais, pagamentos anteriores de fatura, limite disponível
- NÃO inclua estornos ou valores negativos
- Converta valores "129,90" para 129.90

CAMPOS:
- description: texto original da linha de lançamento (preservar padrão XX/YY se existir)
- amount: valor positivo em reais (número)
- date: YYYY-MM-DD (se só dia/mês, use ${ref_month} como ano de referência)
- category: classifique com base nestas regras rígidas:
  * POSTO, AUTO POSTO, SHELL, IPIRANGA, PETROBRAS, COMBUSTIVEL → "transporte"
  * GOOGLE, APPLE, CAPCUT, NETFLIX, SPOTIFY, AMAZON PRIME, YOUTUBE, DISNEY, PARAMOUNT, HBO → "servicos"
  * FARMACIA, DROGARIA, PAGUE MENOS, ULTRAFARMA, HAPVIDA, UNIMED, HOSPITAL, CLINICA, HOSPCOM, LABORATORIO, OPTIMUS SAUDE → "saude"
  * MERCADO, SUPERMERCADO, CARREFOUR, EXTRA, ATACADAO, ASSAI, IFOOD, RAPPI, UBER EATS, DELIVERY → "alimentacao"
  * UBER, 99, CABIFY, METRO, ONIBUS, PASSAGEM, LATAM, GOL, AZUL, EMBARQUE → "transporte"
  * ESCOLA, UNIVERSIDADE, CURSO, UDEMY, ALURA, FACULDADE → "educacao"
  * IOF, TAXA, IMPOSTO, ENCARGO, MULTA → "impostos"
  * HOTEL, AIRBNB, CINEMA, TEATRO, SHOW, INGRESSO, BOOKING → "lazer"
  * ROUPA, CALCADO, ZARA, RENNER, RIACHUELO, HERING → "vestuario"
  * ALUGUEL, CONDOMINIO, ENERGIA, AGUA, GAS, INTERNET, TELEFONE → "moradia"
  * Use "outros" apenas quando NENHUMA regra acima se aplicar

Retorne JSON com array "items".`,
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

    // Passo 3: pós-processamento no servidor
    const items = (result?.items || []).map(item => {
      // Sanitiza descrição (remove sufixos geográficos)
      let desc = sanitizeDescription(item.description);

      // Extrai parcela do padrão XX/YY
      const inst = extractInstallment(desc);
      if (inst) {
        desc = removeInstallmentPattern(desc);
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