import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { category_slug, month, year } = body;

    if (!category_slug || !month || !year) {
      return Response.json({ error: 'category_slug, month and year are required' }, { status: 400 });
    }

    // 1) Buscar categorias para pegar o ID correto
    const categories = await base44.entities.Category.list('name', 500);
    const used = categories.find(c => c.slug === category_slug);
    
    if (!used) {
      return Response.json({ error: `Category not found: ${category_slug}` }, { status: 404 });
    }

    // 2) Buscar Budget para esta categoria específica
    const budgets = await base44.entities.Budget.filter({
      month: Number(month),
      year: Number(year),
    });
    
    // Filtro direto pelo ID da categoria
    const budgetEntry = budgets.find((b) => b.category_id === used.id);
    const planned = budgetEntry ? Number(budgetEntry.amount) : 0;

    // 3) Buscar transações do mês para esta categoria
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const dateStart = `${year}-${mm}-01`;
    const dateEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const transactions = await base44.entities.Transaction.filter({
      type: 'expense',
      date: { $gte: dateStart, $lte: dateEnd },
    }, '-date', 5000);

    const rawSpent = transactions
      .filter((t) => t.category === used.slug)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const spent = Number(rawSpent.toFixed(2));
    const utilization = planned > 0 ? Number(((spent / planned) * 100).toFixed(2)) : 0;
    const available = Number((planned - spent).toFixed(2));

    return Response.json({
      category_slug: used.slug,
      category_name: used.name,
      root_slug: used.slug,
      root_name: used.name,
      month: Number(month),
      year: Number(year),
      has_budget: planned > 0,
      planned: Number(planned.toFixed(2)),
      spent,
      utilization,
      available,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});