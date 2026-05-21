import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function dueDateForMonth(monthKey, dueDay) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Number(dueDay), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function materializeMonth(base44, monthKey) {
  const recurrences = await base44.entities.Recurrence.list('-created_date', 500);
  const payables = await base44.entities.Payable.list('-due_date', 1000);
  const activeRecurrences = recurrences.filter(r => r.active !== false);
  const toCreate = [];

  for (const recurrence of activeRecurrences) {
    const exists = payables.some(p => p.recurrence_id === recurrence.id && String(p.competencia || p.due_date || '').slice(0, 7) === monthKey);
    if (exists) continue;

    const dueDate = dueDateForMonth(monthKey, recurrence.due_day);
    toCreate.push({
      description: recurrence.description,
      amount: Number(recurrence.amount) || 0,
      due_date: `${dueDate}T12:00:00`,
      competencia: `${monthKey}-01`,
      category: recurrence.category || 'outros',
      category_id: recurrence.category_id || undefined,
      status: 'pending',
      recurrent: true,
      recurrence_id: recurrence.id,
      origin_id: recurrence.origin_id || undefined,
      origin_type: recurrence.origin_type || (recurrence.origin_id ? 'account' : undefined),
      payment_modality: recurrence.payment_modality || 'manual',
      notes: recurrence.notes || undefined,
    });
  }

  if (toCreate.length === 0) return [];
  return await base44.entities.Payable.bulkCreate(toCreate);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const month = body.month || currentMonthKey();
    const created = await materializeMonth(base44, month);

    return Response.json({ status: 'success', month, created_count: created.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});