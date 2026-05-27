import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => normalizeText(value).split(' ').filter((token) => token.length > 2);

const isCloseDate = (baseDate, dueDate) => {
  if (!baseDate || !dueDate) return false;
  const base = new Date(`${baseDate}T12:00:00`);
  const due = new Date(String(dueDate).slice(0, 10) + 'T12:00:00');
  const diffDays = Math.abs((due.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 35;
};

const scorePayable = ({ payable, amount, description, date, originId, originType }) => {
  const data = payable || {};
  let score = 0;

  if (Number(data.amount) !== Number(amount)) return -1;
  score += 50;

  const inputTokens = tokenize(description);
  const payableText = normalizeText(data.description);
  const matchedTokens = inputTokens.filter((token) => payableText.includes(token));

  if (matchedTokens.length === 0) return -1;
  score += matchedTokens.length * 15;

  if (isCloseDate(date, data.due_date)) score += 20;

  if (originId && data.origin_id === originId) score += 25;
  if (originType && data.origin_type === originType) score += 15;

  if (data.installment_number) score += 5;
  if (data.installment_count) score += 5;

  return score;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { amount, description, date, origin_id, origin_type } = payload;

    if (!amount || !description) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const payables = await base44.entities.Payable.filter({});
    const openPayables = payables.filter((item) => {
      const status = item?.status;
      return status === 'pending' || status === 'provisioned';
    });

    const ranked = openPayables
      .map((payable) => ({
        payable,
        score: scorePayable({
          payable,
          amount,
          description,
          date,
          originId: origin_id,
          originType: origin_type,
        }),
      }))
      .filter((item) => item.score >= 70)
      .sort((a, b) => b.score - a.score);

    const matches = ranked.map(({ payable, score }) => ({
      id: payable.id,
      score,
      description: payable.description || '',
      amount: payable.amount || 0,
      due_date: payable.due_date || null,
      status: payable.status || null,
      installment_number: payable.installment_number || null,
      installment_count: payable.installment_count || null,
      origin_id: payable.origin_id || null,
      origin_type: payable.origin_type || null,
      category: payable.category || null,
      category_id: payable.category_id || null,
    }));

    return Response.json({
      success: true,
      found: matches.length > 0,
      best_match: matches[0] || null,
      matches,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});