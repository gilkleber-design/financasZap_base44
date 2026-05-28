import { createClientFromRequest } from 'npm:@base44/sdk@0.8.29';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const {
            description, amount, type, date, origin_id, origin_type,
            category_id, conciliate_id, notes
        } = payload;

        if (!description || !amount || !type || !origin_id || !origin_type) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const isAccount = origin_type === 'account';
        const safeType = type === 'receipt' ? 'income' : type;
        const actualAmount = Number(amount);

        // 1. Buscar registro conciliado (se houver)
        let conciliationRecord = null;
        let predictedAmount = null;

        if (conciliate_id) {
            const service = safeType === 'income' ? base44.entities.Receivable : base44.entities.Payable;
            const results = await service.filter({ id: conciliate_id });
            conciliationRecord = results?.[0] || null;

            if (conciliationRecord) {
                predictedAmount = Number(
                    safeType === 'income' && conciliationRecord.net_amount != null
                        ? conciliationRecord.net_amount
                        : conciliationRecord.amount
                );
            }
        }

        // 2. Resolver category_id: payload > registro conciliado
        const resolvedCategoryId = category_id || conciliationRecord?.category_id || null;

        // 3. Buscar nome da categoria para o resumo
        let categoryRecord = null;
        if (resolvedCategoryId) {
            const cats = await base44.entities.Category.filter({ id: resolvedCategoryId });
            categoryRecord = cats?.[0] || null;
        }

        // 4. Criar a transação
        const tx = await base44.entities.Transaction.create({
            description: conciliationRecord?.description || description,
            amount: actualAmount,
            net_amount: actualAmount,
            type: safeType,
            category: categoryRecord?.slug || null,
            category_id: resolvedCategoryId,
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: !isAccount ? origin_id : undefined,
            reconciled: !!conciliate_id,
            status: conciliate_id ? 'conciliated' : 'registered',
            notes: notes || 'Gerado via Assistente',
            ...(conciliate_id && safeType === 'income' && { receivable_id: conciliate_id }),
            ...(conciliate_id && safeType !== 'income' && { payable_id: conciliate_id }),
        });

        // 5. Quitar o título conciliado
        if (conciliate_id && conciliationRecord) {
            const amountChanged = predictedAmount !== null && predictedAmount !== actualAmount;
            const service = safeType === 'income' ? base44.entities.Receivable : base44.entities.Payable;
            await service.update(conciliate_id, {
                status: safeType === 'income' ? 'received' : (conciliationRecord.origin_type === 'card' ? 'conciliated' : 'paid'),
                transaction_id: tx.id,
                ...(amountChanged && { amount: actualAmount, net_amount: actualAmount }),
            });
        }

        // 6. Buscar origem para o resumo
        const originResults = isAccount
            ? await base44.entities.Account.filter({ id: origin_id })
            : await base44.entities.Card.filter({ id: origin_id });
        const originRecord = originResults?.[0] || null;

        return Response.json({
            success: true,
            transaction: tx,
            summary_context: {
                category_name: categoryRecord?.name || null,
                category_slug: categoryRecord?.slug || null,
                origin_name: originRecord?.name || originRecord?.holder_name || null,
                amount: tx.amount,
                description: tx.description,
                event_date: tx.date,
                status: tx.status,
                predicted_amount: predictedAmount,
                amount_updated: predictedAmount !== null && predictedAmount !== actualAmount,
            }
        });

    } catch (error) {
        console.error("Error registering transaction:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});