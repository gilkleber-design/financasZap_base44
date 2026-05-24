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
      return Response.json(
        { error: 'category_slug, month and year are required' },
        { status: 400 }
      );
    }

    // 1) Buscar todas as categorias (necessário p/ identificar raiz e filhas)
    const categories = await base44.entities.Category.list('name', 500);
    const catBySlug = {};
    const catById = {};
    categories.forEach((c) => {
      catBySlug[c.slug] = c;
      catById[c.id] = c;
    });

    const used = catBySlug[category_slug];
    if (!used) {
      return Response.json({ error: `Category not found: ${category_slug}` }, { status: 404 });
    }

    // 2) Identificar a raiz
    const root = used.parent_id ? catById[used.parent_id] || used : used;

    // 3) Coletar todos os IDs e slugs do grupo (raiz + filhas)
    const groupIds = [root.id];
    const groupSlugs = [root.slug];
    categories.forEach((c) => {
      if (c.parent_id === root.id) {
        groupIds.push(c.id);
        groupSlugs.push(c.slug);
      }
    });

    // 4) Buscar Budget: primeiro na categoria usada, depois na raiz
    const budgets = await base44.entities.Budget.filter({
      month: Number(month),
      year: Number(year),
    });
    let budget = budgets.find((b) => b.category_id === used.id);
    if (!budget && used.id !== root.id) {
      budget = budgets.find((b) => b.category_id === root.id);
    }
    const planned = budget?.amount || 0;

    // 5) Buscar transactions do mês para todos os slugs do grupo
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const dateStart = `${year}-${mm}-01`;
    const dateEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const transactions = await base44.entities.Transaction.filter({
      type: 'expense',
      date: { $gte: dateStart, $lte: dateEnd },
    }, '-date', 5000);

    const spent = transactions
      .filter((t) => groupSlugs.includes(t.category))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const utilization = planned > 0 ? (spent / planned) * 100 : 0;
    const available = planned - spent;

    return Response.json({
      category_slug: used.slug,
      category_name: used.name,
      root_slug: root.slug,
      root_name: root.name,
      month: Number(month),
      year: Number(year),
      has_budget: planned > 0,
      planned,
      spent,
      utilization,
      available,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});