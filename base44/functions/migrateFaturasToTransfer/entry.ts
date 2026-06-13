import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const execute = body.execute === true;

        // 1. Busca categorias alvo e a categoria destino "fatura"
        const allCats = await base44.entities.Category.list('name', 500);

        const sourceSlugs = ['faturas_de_cartao', 'passivos_de_transicao'];
        const sourceCats = allCats.filter(c => sourceSlugs.includes(c.slug));
        const sourceIds = sourceCats.map(c => c.id);

        const faturaCat = allCats.find(c => c.slug === 'fatura' && c.type === 'transfer');

        if (!faturaCat) {
            return Response.json({
                error: 'Categoria "fatura" (type=transfer) não encontrada. Crie-a antes de migrar.',
                available_transfer_cats: allCats.filter(c => c.type === 'transfer').map(c => ({ id: c.id, name: c.name, slug: c.slug }))
            }, { status: 400 });
        }

        // 2. Busca todas as transactions de despesa
        const allTxs = await base44.entities.Transaction.filter({ type: 'expense' }, '-date', 5000);

        // 3. Filtra as que usam category_id ou category slug das fontes
        const targets = allTxs.filter(t =>
            sourceIds.includes(t.category_id) ||
            sourceSlugs.includes(t.category)
        );

        if (!execute) {
            // PREVIEW
            const byCategory = {};
            targets.forEach(t => {
                const key = t.category_id || t.category || 'sem_categoria';
                const catName = sourceCats.find(c => c.id === t.category_id || c.slug === t.category)?.name || key;
                if (!byCategory[key]) byCategory[key] = { name: catName, count: 0, total: 0 };
                byCategory[key].count++;
                byCategory[key].total += t.amount || 0;
            });

            return Response.json({
                mode: 'preview',
                to_update_count: targets.length,
                total_amount: targets.reduce((s, t) => s + (t.amount || 0), 0),
                target_category: { id: faturaCat.id, name: faturaCat.name, slug: faturaCat.slug, type: faturaCat.type },
                by_source_category: Object.values(byCategory),
                sample: targets.slice(0, 20).map(t => ({
                    id: t.id,
                    date: t.date,
                    description: t.description,
                    amount: t.amount,
                    category: t.category,
                    category_id: t.category_id
                })),
                note: 'Para executar, envie { "execute": true } no body.'
            });
        }

        // EXECUTE
        let updated = 0;
        const errors = [];
        for (const t of targets) {
            try {
                await base44.entities.Transaction.update(t.id, {
                    category: faturaCat.slug,
                    category_id: faturaCat.id
                });
                updated++;
            } catch (e) {
                errors.push({ id: t.id, error: e.message });
            }
        }

        return Response.json({
            mode: 'execute',
            updated,
            errors_count: errors.length,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});