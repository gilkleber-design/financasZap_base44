import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const toDateKey = (date) => date.toISOString().split('T')[0];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayKey = toDateKey(today);
    const tomorrowKey = toDateKey(tomorrow);

    const payables = await base44.asServiceRole.entities.Payable.list('-due_date', 500);
    const pendingPayables = payables.filter((item) =>
      item.due_alert_enabled === true &&
      item.status === 'pending' &&
      item.due_date &&
      [todayKey, tomorrowKey].includes(String(item.due_date).split('T')[0])
    );

    return Response.json({
      success: true,
      total_due_alerts: pendingPayables.length,
      alerts: pendingPayables.map((item) => ({
        payable_id: item.id,
        description: item.description,
        amount: formatCurrency(item.amount),
        due_date: String(item.due_date).split('T')[0],
        timing: String(item.due_date).split('T')[0] === todayKey ? 'today' : 'tomorrow',
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});