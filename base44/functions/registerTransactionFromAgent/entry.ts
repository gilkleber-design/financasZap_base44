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
            category, category_id, conciliate_id, notes
        } = payload;

        if (!description || !amount || !type || !origin_id || !origin_type) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const isAccount = origin_type === 'account';
        const isCard = origin_type === 'card';
        const safeType = type === 'receipt' ? 'income' : type;
        const actualAmount = Number(amount);

        // Resolver categoria: slug direto > category_id > herdado da conciliação
        let resolvedCategory = category || undefined;

        if (!resolvedCategory && category_id) {
            const cats = await base44.entities.Category.filter({ id: category_id });
            resolvedCategory = cats?.[0]?.slug || undefined;
        }

        // Buscar registro conciliado (necessário antes de txData)
        let predictedAmount = null;
        let conciliationRecord = null;

        if (conciliate_id) {
            if (safeType === 'income') {
                const recs = await base44.entities.Receivable.filter({ id: conciliate_id });
                conciliationRecord = recs?.[0] || null;
            } else {
                const pays = await base44.entities.Payable.filter({ id: conciliate_id });
                conciliationRecord = pays?.[0] || null;
            }
            if (conciliationRecord) {
                predictedAmount = Number(
                    safeType === 'income' && conciliationRecord.net_amount
                        ? conciliationRecord.net_amount
                        : conciliationRecord.amount
                );
                // Fallback: herda categoria do registro conciliado se ainda não resolvida
                if (!resolvedCategory && conciliationRecord.category) {
                    resolvedCategory = conciliationRecord.category;
                }
            }
        }

        const txData = {
            description: conciliationRecord?.description || description,
            amount: actualAmount,
            net_amount: actualAmount,
            type: safeType,
            category: resolvedCategory,
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: isCard ? origin_id : undefined,
            reconciled: !!conciliate_id,
            status: conciliate_id ? 'conciliated' : 'registered',
            notes: notes || 'Gerado via Assistente',
            ...(conciliate_id && safeType === 'income' && { receivable_id: conciliate_id }),
            ...(conciliate_id && safeType !== 'income' && { payable_id: conciliate_id }),
        };

        const tx = await base44.entities.Transaction.create(txData);

        if (conciliate_id) {
            const amountChanged = predictedAmount !== null && predictedAmount !== actualAmount;

            if (safeType === 'income') {
                await base44.entities.Receivable.update(conciliate_id, {
                    status: 'received',
                    transaction_id: tx.id,
                    ...(amountChanged && { net_amount: actualAmount, amount: actualAmount }),
                });
            } else {
                const nextStatus = conciliationRecord?.origin_type === 'card' ? 'conciliated' : 'paid';
                await base44.entities.Payable.update(conciliate_id, {
                    status: nextStatus,
                    transaction_id: tx.id,
                    ...(amountChanged && { amount: actualAmount }),
                });
            }
        }

        const categories = resolvedCategory
            ? await base44.entities.Category.filter({ slug: resolvedCategory })
            : [];
        const categoryRecord = categories?.[0] || null;

        const originList = isAccount
            ? await base44.entities.Account.filter({ id: origin_id })
            : await base44.entities.Card.filter({ id: origin_id });
        const originRecord = originList?.[0] || null;

        return Response.json({
            success: true,
            transaction: tx,
            summary_context: {
                category_slug: categoryRecord?.slug || resolvedCategory || null,
                category_name: categoryRecord?.name || null,
                origin_name: originRecord?.name || originRecord?.holder_name || null,
                institution_name: originRecord?.bank || null,
                event_date: tx.date,
                effective_date: tx.date,
                amount: tx.amount,
                description: tx.description,
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