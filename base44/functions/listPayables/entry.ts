import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function toDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function monthKeyFromDate(value) {
  return toDateOnly(value).slice(0, 7);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isFutureMonth(month) {
  return month > currentMonthKey();
}

function dueDateForMonth(monthKey, dueDay) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Number(dueDay), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function typeMatches(item, filter) {
  if (filter === 'FIXAS') return !!item.recurrence_id || !!item.recurrent;
  if (filter === 'PARCELADAS') return !!item.installment_group_id;
  if (filter === 'AVULSAS') return !item.recurrence_id && !item.recurrent && !item.installment_group_id;
  return true;
}

function monthMatches(item, month, sortBy) {
  const field = sortBy === 'competencia' ? (item.competencia || item.due_date) : item.due_date;
  return monthKeyFromDate(field) === month;
}

async function materializeCurrentMonth(base44, month) {
  if (month !== currentMonthKey()) return;

  const recurrences = await base44.entities.Recurrence.list('-created_date', 500);
  const payables = await base44.entities.Payable.list('-due_date', 1000);
  const toCreate = [];

  for (const recurrence of recurrences.filter(r => r.active !== false)) {
    const exists = payables.some(p => p.recurrence_id === recurrence.id && monthKeyFromDate(p.competencia || p.due_date) === month);
    if (exists) continue;

    const dueDate = dueDateForMonth(month, recurrence.due_day);
    toCreate.push({
      description: recurrence.description,
      amount: Number(recurrence.amount) || 0,
      due_date: `${dueDate}T12:00:00`,
      competencia: `${month}-01`,
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

  if (toCreate.length > 0) await base44.entities.Payable.bulkCreate(toCreate);
}

function makeProjection(recurrence, month) {
  const dueDate = dueDateForMonth(month, recurrence.due_day);
  return {
    id: `projection_${recurrence.id}_${month}`,
    description: recurrence.description,
    amount: Number(recurrence.amount) || 0,
    due_date: `${dueDate}T12:00:00`,
    competencia: `${month}-01`,
    category: recurrence.category || 'outros',
    category_id: recurrence.category_id || null,
    status: 'pending',
    recurrent: true,
    recurrence_id: recurrence.id,
    origin_id: recurrence.origin_id || null,
    origin_type: recurrence.origin_type || (recurrence.origin_id ? 'account' : null),
    payment_modality: recurrence.payment_modality || 'manual',
    notes: recurrence.notes || null,
    is_projection: true,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const month = body.month || currentMonthKey();
    const filter = body.filter || 'TODAS';
    const status = body.status || 'EM_ABERTO';
    const sortBy = body.sort || 'due_date';

    await materializeCurrentMonth(base44, month);

    const payables = await base44.entities.Payable.list('-due_date', 1000);
    const recurrences = await base44.entities.Recurrence.list('-created_date', 500);
    const future = isFutureMonth(month);
    let items = [];

    if (status === 'VENCIDAS') {
      items = payables.filter(p => p.status === 'pending' && toDateOnly(p.due_date) < todayKey() && typeMatches(p, filter));
    } else if (status === 'PAGAS') {
      items = payables.filter(p => p.status === 'paid' && monthMatches(p, month, sortBy) && typeMatches(p, filter));
    } else {
      const realOpen = payables.filter(p => p.status === 'pending' && monthMatches(p, month, sortBy));
      const projections = future && filter !== 'PARCELADAS' && filter !== 'AVULSAS'
        ? recurrences
            .filter(r => r.active !== false)
            .filter(r => !payables.some(p => p.recurrence_id === r.id && monthKeyFromDate(p.competencia || p.due_date) === month))
            .map(r => makeProjection(r, month))
        : [];

      items = [...realOpen, ...projections].filter(item => typeMatches(item, filter));
    }

    items.sort((a, b) => {
      const aDate = toDateOnly(sortBy === 'competencia' ? (a.competencia || a.due_date) : a.due_date);
      const bDate = toDateOnly(sortBy === 'competencia' ? (b.competencia || b.due_date) : b.due_date);
      return aDate.localeCompare(bDate) || String(a.description || '').localeCompare(String(b.description || ''));
    });

    return Response.json({ status: 'success', month, items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});