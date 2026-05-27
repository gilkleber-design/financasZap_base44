import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Stop words para limpar o ruído da mensagem do WhatsApp
const STOP_WORDS = [
  'recebi', 'paguei', 'caiu', 'hoje', 'ontem', 'amanha', 
  'de', 'para', 'no', 'na', 'do', 'da', 'em', 'com', 'por', 
  'um', 'uma', 'os', 'as', 'conta', 'boleto', 'pix', 'transferencia', 'fatura'
];

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => {
  const tokens = normalizeText(value).split(' ').filter((t) => t.length > 2);
  // Remove números soltos e stop words para focar apenas nos substantivos/nomes
  return tokens.filter((t) => isNaN(Number(t)) && !STOP_WORDS.includes(t));
};

const scoreOpenItem = ({ item, amount, description, kind }) => {
  const data = item || {};
  let score = 0;

  const itemAmount = kind === 'receivable' && data.net_amount ? Number(data.net_amount) : Number(data.amount);
  
  // 1. Destilação e Match de Texto (Recompensa)
  const inputTokens = tokenize(description);
  const itemText = normalizeText(data.description);
  
  let matchedTokensCount = 0;
  inputTokens.forEach((token) => {
    if (itemText.includes(token)) {
      score += 50; // Recompensa forte por cada palavra útil encontrada
      matchedTokensCount++;
    }
  });

  // Se NENHUMA palavra bateu, a pontuação é zero e o item será descartado.
  if (matchedTokensCount === 0) return 0;

  // 2. Bônus de Valor (Critério de desempate, não de eliminação)
  const diff = Math.abs(itemAmount - Number(amount));
  if (diff <= 5.00) {
    score += 30; // Bônus alto: valor bateu exatamente ou quase
  } else if (diff <= 50.00) {
    score += 10; // Bônus baixo: valor próximo
  }

  return score;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { amount, description } = payload;

    if (!amount || !description) {
      return Response.json({ error: 'amount and description are required' }, { status: 400 });
    }

    const [payables, receivables] = await Promise.all([
      base44.entities.Payable.filter({}),
      base44.entities.Receivable.filter({}),
    ]);

    // Calcula a pontuação e filtra apenas o que teve match de texto (score > 0)
    const ranked = [
      ...payables.filter(i => ['pending', 'provisioned', 'open'].includes(i?.status)).map((item) => ({
        kind: 'payable',
        item,
        score: scoreOpenItem({ item, amount, description, kind: 'payable' }),
      })),
      ...receivables.filter(i => ['pending', 'open'].includes(i?.status)).map((item) => ({
        kind: 'receivable',
        item,
        score: scoreOpenItem({ item, amount, description, kind: 'receivable' }),
      })),
    ]
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // Motor de Desambiguação
    let scenario = 'C';
    let bestMatch = null;
    let topMatches = [];

    if (ranked.length > 0) {
      // Se tiver só 1, ou se o 1º colocado tiver uma vantagem de pelo menos 40 pontos sobre o 2º
      if (ranked.length === 1 || (ranked.length > 1 && ranked[0].score >= ranked[1].score + 40)) {
        scenario = 'A'; // Tiro certeiro
        bestMatch = ranked[0];
        topMatches = [ranked[0]];
      } else {
        scenario = 'B'; // Ambiguidade (pontuações próximas)
        topMatches = ranked.slice(0, 3); // Retorna no máximo os 3 melhores
      }
    }

    return Response.json({ 
      success: true, 
      scenario, // 'A' (Certeiro), 'B' (Lista Numerada) ou 'C' (Nenhum)
      best_match: bestMatch, 
      matches: topMatches 
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});