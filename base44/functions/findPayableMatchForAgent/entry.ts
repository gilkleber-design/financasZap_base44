import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STOP_WORDS = [
  'recebi', 'paguei', 'caiu', 'hoje', 'ontem', 'amanha',
  'de', 'para', 'no', 'na', 'do', 'da', 'em', 'com', 'por',
  'um', 'uma', 'os', 'as', 'conta', 'boleto', 'pix', 'transferencia', 'fatura'
];

const MONTH_ORDER = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

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
  return tokens.filter((t) => isNaN(Number(t)) && !STOP_WORDS.includes(t));
};

const extractCompetencySort = (description) => {
  const normalized = normalizeText(description);
  for (const [name, num] of Object.entries(MONTH_ORDER)) {
    if (normalized.includes(name)) {
      const yearMatch = normalized.match(/\d{4}/);
      const year = yearMatch ? Number(yearMatch[0]) : 0;
      return year * 100 + num;
    }
  }
  return 9999;
};

const formatBRL = (value) =>
  Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getExpectedAmount = (item) => Number(item.amount || 0);

const getReceivedAmount = (kind, item) =>
  kind === 'receivable' && item.net_amount ? Number(item.net_amount) : Number(item.amount || 0);

const scoreOpenItem = ({ item, amount, description, kind }) => {
  const data = item || {};
  let score = 0;

  const inputTokens = tokenize(description);
  const itemText = normalizeText(data.description);

  let matchedTokensCount = 0;
  inputTokens.forEach((token) => {
    if (itemText.includes(token)) {
      score += 50;
      matchedTokensCount++;
    }
  });

  if (matchedTokensCount === 0) return 0;

  const receivedDiff = Math.abs(getReceivedAmount(kind, data) - Number(amount));
  const expectedDiff = Math.abs(getExpectedAmount(data) - Number(amount));

  if (receivedDiff <= 5.00) {
    score += 30;
  } else if (receivedDiff <= 50.00) {
    score += 10;
  }

  if (kind === 'receivable') {
    if (expectedDiff <= 5.00) {
      score += 8;
    } else if (expectedDiff <= 50.00) {
      score += 3;
    }
  }

  return score;
};

const serializeMatch = (m) => ({
  ...m,
  formatted_amount: formatBRL(getReceivedAmount(m.kind, m.item)),
  formatted_expected_amount: formatBRL(getExpectedAmount(m.item)),
});

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

    const ranked = [
      ...payables
        .filter((i) => ['pending', 'provisioned', 'open'].includes(i?.status))
        .map((item) => ({
          kind: 'payable',
          item,
          score: scoreOpenItem({ item, amount, description, kind: 'payable' }),
        })),
      ...receivables
        .filter((i) => ['pending', 'open'].includes(i?.status))
        .map((item) => ({
          kind: 'receivable',
          item,
          score: scoreOpenItem({ item, amount, description, kind: 'receivable' }),
        })),
    ]
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    let scenario = 'C';
    let bestMatch = null;
    let topMatches = [];

    if (ranked.length > 0) {
      if (ranked.length === 1 || ranked[0].score >= ranked[1].score + 40) {
        scenario = 'A';
        bestMatch = serializeMatch(ranked[0]);
        topMatches = [bestMatch];
      } else {
        scenario = 'B';
        topMatches = ranked
          .slice(0, 3)
          .sort((a, b) => extractCompetencySort(a.item.description) - extractCompetencySort(b.item.description))
          .map(serializeMatch);
      }
    }

    return Response.json({
      success: true,
      scenario,
      best_match: bestMatch,
      matches: topMatches,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});