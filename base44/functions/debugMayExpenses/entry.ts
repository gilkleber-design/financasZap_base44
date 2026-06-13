import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        // ---- BLOCO C.1: listar transactions por categoria de fatura ----
        const body = await req.json().catch(() => ({}));
        if (body.mode === 'list_fatura_categories') {
            const allCats = await base44.entities.Category.list('name', 500);
            const allTxs = await base44.entities.Transaction.filter({ type: 'expense' }, '-date', 2000);
            
            const targetSlugs = ['faturas_de_cartao', 'passivos_de_transicao', 'fatura'];
            const targetCats = allCats.filter(c => targetSlugs.includes(c.slug));
            const targetIds = targetCats.filter(c => c.slug !== 'fatura').map(c => c.id);
            const targetSlugNames = ['faturas_de_cartao', 'passivos_de_transicao'];
            
            const hits = allTxs.filter(t => 
                targetIds.includes(t.category_id) || 
                targetSlugNames.includes(t.category)
            );
            
            return Response.json({
                categories_found: targetCats.map(c => ({ id: c.id, name: c.name, slug: c.slug, type: c.type })),
                all_slugs_sample: allCats.slice(0, 30).map(c => ({ slug: c.slug, type: c.type })),
                transactions_count: hits.length,
                total_amount: hits.reduce((s, t) => s + (t.amount || 0), 0),
                items: hits.map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, category: t.category, category_id: t.category_id }))
            });
        }
        // ----------------------------------------------------------------

        const startMay = '2026-05-01';
        const startJun = '2026-06-01';

        // Usa o client do usuário (com RLS) — Transaction tem $or: [created_by_id, family_id]
        // Busca todas as transações do usuário sem filtro extra, depois filtra em memória
        const allTxs = await base44.entities.Transaction.filter({
            type: 'expense',
            date: { $gte: startMay, $lt: startJun }
        }, '-amount', 5000);

        const allPayables = await base44.entities.Payable.list('-amount', 5000);

        const _debug = {
            user_id: user.id,
            family_id: user.family_id,
            txs_fetched: allTxs.length,
            payables_fetched: allPayables.length,
            tx_sample: allTxs.slice(0, 3).map(t => ({ id: t.id, amount: t.amount, date: t.date, payable_id: t.payable_id })),
        };

        const payablesMap = {};
        allPayables.forEach(p => { payablesMap[p.id] = p; });

        const payablesMay = allPayables.filter(p => {
            const ref = p.competencia || p.due_date;
            return ref >= startMay && ref < startJun;
        });

        // 1. Transactions de despesa em maio
        const txsMay = allTxs;
        const top5Txs = txsMay.slice(0, 5).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date, payable_id: t.payable_id }));

        // 2. Payables de maio pagos
        const payablesMayPaid = payablesMay.filter(p => p.status === 'paid');
        const top5PayablesPaid = payablesMayPaid.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        // 3. Txs de maio cujo payable é de OUTRO mês
        const crossingTxs = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef < startMay || pRef >= startJun;
        }).map(t => {
            const p = payablesMap[t.payable_id];
            return { amount: t.amount, tx_desc: t.description, tx_date: t.date, payable_ref: p.competencia || p.due_date, payable_desc: p.description };
        });

        // 4. Duplicidades: múltiplas txs de maio -> mesmo payable
        const txByPayable = {};
        txsMay.forEach(t => {
            if (t.payable_id) {
                if (!txByPayable[t.payable_id]) txByPayable[t.payable_id] = [];
                txByPayable[t.payable_id].push(t);
            }
        });
        const duplicates = Object.entries(txByPayable)
            .filter(([, arr]) => arr.length > 1)
            .map(([k, arr]) => ({
                payable_id: k,
                payable_desc: payablesMap[k]?.description,
                count: arr.length,
                total_amount: arr.reduce((s, t) => s + t.amount, 0),
                tx_dates: arr.map(t => t.date)
            }));

        // 5. Cartões
        const invoicesMay = payablesMay.filter(p => p.is_card_invoice_payable);
        const invoiceItemsSum = payablesMay.filter(p => p.card_invoice_id && !p.is_card_invoice_payable).reduce((s, p) => s + (p.amount || 0), 0);

        // 6. Órfãs: txs sem payable ou cujo payable não existe
        const orphansMay = txsMay.filter(t => !t.payable_id || !payablesMap[t.payable_id]);
        const top10Orphans = orphansMay.slice(0, 10).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));

        // A. Payables duplicados (mesmo description + ref + amount)
        const dupKey = (p) => `${p.description?.toLowerCase().trim()}|${p.competencia || p.due_date}|${p.amount}`;
        const dupGroups = {};
        payablesMay.forEach(p => {
            const k = dupKey(p);
            if (!dupGroups[k]) dupGroups[k] = [];
            dupGroups[k].push(p);
        });
        const duplicatePayables = Object.values(dupGroups)
            .filter(arr => arr.length > 1)
            .map(arr => ({
                desc: arr[0].description,
                ref: arr[0].competencia || arr[0].due_date,
                amount: arr[0].amount,
                count: arr.length,
                excess_sum: arr[0].amount * (arr.length - 1),
                ids: arr.map(p => p.id),
                statuses: arr.map(p => p.status)
            }));

        // B. Transações que parecem pagamento de fatura de cartão (sem payable_id)
        const cardKeywords = ['fatura', 'invoice', 'cartão', 'cartao', 'nubank', 'itaú', 'itau', 'elo', 'mastercard', 'visa', 'mercado pago', 'bradesco card', 'c6', 'inter card'];
        const cardOrphans = orphansMay.filter(t => {
            const d = (t.description || '').toLowerCase();
            return cardKeywords.some(k => d.includes(k));
        }).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));

        // 7. Payables pendentes em maio
        const payablesMayPending = payablesMay.filter(p => p.status !== 'paid');
        const top5PayablesPending = payablesMayPending.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        // 8. Soma detalhada
        const a_txsPaidInMonth = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef >= startMay && pRef < startJun;
        }).reduce((s, t) => s + (t.amount || 0), 0);

        const b_txsPaidOtherMonth = crossingTxs.reduce((s, c) => s + c.amount, 0);
        const c_orphansSum = orphansMay.reduce((s, t) => s + (t.amount || 0), 0);
        const d_payablesPaidSum = payablesMayPaid.reduce((s, p) => s + (p.amount || 0), 0);

        const cardOrphansSum = cardOrphans.reduce((s, t) => s + t.amount, 0);
        const dupPayablesExcessSum = duplicatePayables.reduce((s, d) => s + d.excess_sum, 0);

        return Response.json({
            _debug,
            A_duplicate_payables: {
                title: "A. Payables Duplicados em Maio (mesmo desc+ref+amount)",
                count: duplicatePayables.length,
                excess_sum: dupPayablesExcessSum,
                note: "IDs listados — NÃO foram deletados. O primeiro ID é o 'original', os demais são duplicatas.",
                items: duplicatePayables
            },
            B_card_orphan_txs: {
                title: "B. Transactions Órfãs que parecem fatura de cartão",
                count: cardOrphans.length,
                sum: cardOrphansSum,
                note: "Estas transactions estão sem payable_id e provavelmente são pagamentos de fatura. Se vinculadas a um CardInvoice payable, sairiam das orphans.",
                items: cardOrphans
            },
            1: { title: "1. Transactions Expense (date=Mai/2026)", count: txsMay.length, sum: txsMay.reduce((s, t) => s + (t.amount || 0), 0), top5: top5Txs },
            2: { title: "2. Payables (ref=Mai/2026, status=paid)", count: payablesMayPaid.length, sum: d_payablesPaidSum, top5: top5PayablesPaid },
            3: { title: "3. Cruzamento (Tx Mai -> Payable Outro Mês)", count: crossingTxs.length, sum: b_txsPaidOtherMonth, items: crossingTxs },
            4: { title: "4. Duplicidades (Múltiplas Txs -> Mesmo Payable)", count: duplicates.length, sum_of_txs: duplicates.reduce((s, d) => s + d.total_amount, 0), items: duplicates },
            5: { title: "5. Cartões", invoices_count: invoicesMay.length, invoices_sum: invoicesMay.reduce((s, p) => s + (p.amount || 0), 0), items_sum: invoiceItemsSum },
            6: { title: "6. Transactions Órfãs (sem payable_id)", count: orphansMay.length, sum: c_orphansSum, top10: top10Orphans },
            7: { title: "7. Payables Pendentes em Maio", count: payablesMayPending.length, sum: payablesMayPending.reduce((s, p) => s + (p.amount || 0), 0), top5: top5PayablesPending },
            8: {
                title: "8. Soma Detalhada (As 4 categorias)",
                a_txs_pagas_no_mes: a_txsPaidInMonth,
                b_txs_pagas_outro_mes: b_txsPaidOtherMonth,
                c_despesas_avulsas_orfans: c_orphansSum,
                d_payables_pagos_maio: d_payablesPaidSum,
                legacy_expect: a_txsPaidInMonth + b_txsPaidOtherMonth + c_orphansSum,
                novo_expect: a_txsPaidInMonth + c_orphansSum + d_payablesPaidSum
            }
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});