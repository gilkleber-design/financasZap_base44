import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

export default async function reqHandler(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const month = body.month || new Date().getMonth() + 1;
        const year = body.year || new Date().getFullYear();
        const filters = body.filters || {};
        
        const date_basis = filters.date_basis || 'competencia';
        const amount_basis = filters.amount_basis || 'gross';
        const exclude_categories = filters.exclude_categories || ['passivos_de_transicao', 'retiradas'];
        const exclude_transaction_statuses = filters.exclude_transaction_statuses || ['ignored'];
        const include_card_invoices = filters.include_card_invoices !== false;

        const family_id = user.family_id || user.data?.family_id || user.id;

        const pad = n => String(n).padStart(2, '0');
        const startDateStr = `${year}-${pad(month)}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDateStr = `${year}-${pad(month)}-${pad(lastDay)}`;

        // Fetch categories and sources using user context (handles RLS automatically)
        const categories = await base44.entities.Category.list('name', 500);
        const incomeSources = await base44.entities.IncomeSource.list('name', 500);

        const catMap = {};
        const slugMap = {};
        categories.forEach(c => {
            catMap[c.id] = c;
            if (c.slug) slugMap[c.slug.toLowerCase()] = c;
        });

        const unknown_category_slugs = new Set();

        const getCategory = (id, slug) => {
            if (id && catMap[id]) return catMap[id];
            
            const searchSlugId = String(id || '').toLowerCase();
            if (id && slugMap[searchSlugId]) return slugMap[searchSlugId];

            const searchSlug = String(slug || '').toLowerCase();
            if (slug && slugMap[searchSlug]) return slugMap[searchSlug];
            
            if (id && !catMap[id]) unknown_category_slugs.add(id);
            if (slug && !slugMap[searchSlug]) unknown_category_slugs.add(slug);

            return null;
        };

        // Fetch Data using user context
        const transactions = await base44.entities.Transaction.filter({
            date: { $gte: startDateStr, $lte: endDateStr }
        }, '', 5000);

        const payables = await base44.entities.Payable.filter({
            $or: [
                { competencia: { $gte: startDateStr, $lte: endDateStr } },
                { due_date: { $gte: startDateStr, $lte: endDateStr } }
            ]
        }, '', 5000);

        const receivables = await base44.entities.Receivable.filter({
            $or: [
                { competencia: { $gte: startDateStr, $lte: endDateStr } },
                { due_date: { $gte: startDateStr, $lte: endDateStr } }
            ]
        }, '', 5000);

        // Helper to get data_ref
        const getDataRef = (item, isTx = false) => {
            if (isTx) return item.date;
            if (date_basis === 'competencia') {
                return item.competencia || item.due_date;
            }
            return item.due_date;
        };

        // Filter arrays in JS
        const isMonth = (dateStr) => dateStr >= startDateStr && dateStr <= endDateStr;

        const validTransactions = transactions.filter(t => 
            isMonth(getDataRef(t, true)) && 
            !exclude_transaction_statuses.includes(t.status)
        );

        let validPayables = payables.filter(p => isMonth(getDataRef(p, false))).map(p => ({ ...p, data_ref: getDataRef(p, false) }));
        let validReceivables = receivables.filter(r => isMonth(getDataRef(r, false))).map(r => ({ ...r, data_ref: getDataRef(r, false) }));
        const validTransactionsWithRef = validTransactions.map(t => ({ ...t, data_ref: getDataRef(t, true) }));

        // Rules handling
        if (include_card_invoices) {
            validPayables = validPayables.filter(p => !p.card_invoice_id); 
        } else {
            validPayables = validPayables.filter(p => !p.is_card_invoice_payable);
        }

        // Installments
        validPayables = validPayables.filter(p => {
            if (p.installment_total_amount && (!p.installment_number || p.installment_number <= 0)) {
                return false; // Umbrella
            }
            return true;
        });

        const getAmount = (item, isTx = false) => {
            if (isTx && amount_basis === 'net' && item.net_amount !== undefined) return Number(item.net_amount);
            if (!isTx && amount_basis === 'net' && item.net_amount !== undefined) return Number(item.net_amount);
            return Number(item.amount || 0);
        };

        const isCategoryExcluded = (item) => {
            const cat = getCategory(item.category_id, item.category);
            const slug = cat ? cat.slug.toLowerCase() : (item.category ? String(item.category).toLowerCase() : '__sem_categoria__');
            return exclude_categories.includes(slug);
        };

        const incomeExpectedArray = validReceivables.filter(r => !isCategoryExcluded(r));
        const incomeExpectedTotal = incomeExpectedArray.reduce((s, r) => s + getAmount(r), 0);
        const incomeReceivedTxs = validTransactionsWithRef.filter(t => t.type === 'income' && !isCategoryExcluded(t));
        const incomeReceivedTotal = incomeReceivedTxs.reduce((s, t) => s + getAmount(t, true), 0);
        const incomePendingTotal = Math.max(0, incomeExpectedTotal - incomeReceivedTotal);

        const expenseExpectedArray = validPayables.filter(p => !isCategoryExcluded(p));
        const expenseExpectedTotal = expenseExpectedArray.reduce((s, p) => s + getAmount(p), 0);
        const expensePaidTxs = validTransactionsWithRef.filter(t => t.type === 'expense' && !isCategoryExcluded(t));
        const expensePaidTotal = expensePaidTxs.reduce((s, t) => s + getAmount(t, true), 0);
        const expensePendingTotal = Math.max(0, expenseExpectedTotal - expensePaidTotal);

        const buildCategoryTree = (txs, itemsExpected) => {
            const map = {};
            const allItems = [...txs, ...itemsExpected];
            allItems.forEach(item => {
                const cat = getCategory(item.category_id, item.category);
                const slug = cat ? cat.slug.toLowerCase() : (item.category ? String(item.category).toLowerCase() : '__sem_categoria__');
                const id = cat ? cat.id : slug;
                
                if (!map[id]) {
                    map[id] = {
                        category_id: cat ? cat.id : null,
                        slug: slug,
                        name: cat ? cat.name : 'Sem categoria',
                        color: cat ? cat.color : '#94A3B8',
                        parent_id: cat ? cat.parent_id : null,
                        expected: 0,
                        paid: 0,
                        pending: 0,
                        children: []
                    };
                }
            });

            itemsExpected.forEach(item => {
                const cat = getCategory(item.category_id, item.category);
                const id = cat ? cat.id : (item.category ? String(item.category).toLowerCase() : '__sem_categoria__');
                map[id].expected += getAmount(item);
            });

            txs.forEach(item => {
                const cat = getCategory(item.category_id, item.category);
                const id = cat ? cat.id : (item.category ? String(item.category).toLowerCase() : '__sem_categoria__');
                map[id].paid += getAmount(item, true);
            });

            const roots = [];
            const byId = {};
            Object.values(map).forEach(m => {
                m.pending = Math.max(0, m.expected - m.paid);
                byId[m.category_id || m.slug] = m;
            });

            Object.values(map).forEach(m => {
                if (m.parent_id) {
                    if (!byId[m.parent_id]) {
                        const pCat = catMap[m.parent_id];
                        if (pCat) {
                            const pSlug = pCat.slug.toLowerCase();
                            byId[m.parent_id] = {
                                category_id: pCat.id,
                                slug: pSlug,
                                name: pCat.name,
                                color: pCat.color,
                                parent_id: pCat.parent_id,
                                expected: 0,
                                paid: 0,
                                pending: 0,
                                children: []
                            };
                        }
                    }
                    if (byId[m.parent_id]) {
                        byId[m.parent_id].children.push(m);
                    } else {
                        roots.push(m);
                    }
                } else {
                    roots.push(m);
                }
            });

            const aggregate = (node) => {
                if (node.children && node.children.length > 0) {
                    node.children.forEach(c => {
                        aggregate(c);
                        node.expected += c.expected;
                        node.paid += c.paid;
                        node.pending += c.pending;
                    });
                }
            };

            roots.forEach(r => aggregate(r));
            return roots.sort((a,b) => b.expected - a.expected || b.paid - a.paid);
        };

        const incomeByCategory = buildCategoryTree(incomeReceivedTxs, incomeExpectedArray);
        const mappedIncomeByCategory = incomeByCategory.map(n => ({
            ...n, received: n.paid, paid: undefined
        }));

        const expenseByCategory = buildCategoryTree(expensePaidTxs, expenseExpectedArray);

        const sourceMap = {};
        validReceivables.forEach(r => {
            const sId = r.income_source_id || 'outras';
            if (!sourceMap[sId]) {
                const s = incomeSources.find(x => String(x.id) === String(sId));
                sourceMap[sId] = {
                    source_id: sId, source_name: s ? s.name : (sId === 'outras' ? 'Outras' : 'PJ não identificada'),
                    source_type: s ? s.type : 'pj', expected_gross: 0, received_gross: 0,
                    expected_net: 0, received_net: 0, tax_amount: 0, tax_rate: Number(s?.default_tax_rate || 0)
                };
            }
            sourceMap[sId].expected_gross += Number(r.amount || 0);
            sourceMap[sId].expected_net += Number(r.net_amount || r.amount || 0);
        });

        incomeReceivedTxs.forEach(t => {
            const sId = t.income_source_id || 'outras';
            if (!sourceMap[sId]) {
                const s = incomeSources.find(x => String(x.id) === String(sId));
                sourceMap[sId] = {
                    source_id: sId, source_name: s ? s.name : (sId === 'outras' ? 'Outras' : 'PJ não identificada'),
                    source_type: s ? s.type : 'pj', expected_gross: 0, received_gross: 0,
                    expected_net: 0, received_net: 0, tax_amount: 0, tax_rate: Number(s?.default_tax_rate || 0)
                };
            }
            sourceMap[sId].received_gross += Number(t.amount || 0);
            sourceMap[sId].received_net += Number(t.net_amount || t.amount || 0);
            sourceMap[sId].tax_amount += Number(t.tax_amount || 0);
        });

        // Calculate tax correctly
        Object.values(sourceMap).forEach(s => {
            s.tax_amount = s.expected_gross - s.expected_net;
            if (s.tax_amount > 0 && s.expected_gross > 0 && s.tax_rate === 0) {
                s.tax_rate = Number((s.tax_amount / s.expected_gross * 100).toFixed(1));
            }
        });

        const incomeBySource = Object.values(sourceMap);

        const resultObj = {
            expected: incomeExpectedTotal - expenseExpectedTotal,
            realized: incomeReceivedTotal - expensePaidTotal,
            projected: incomeReceivedTotal + incomePendingTotal - (expensePaidTotal + expensePendingTotal),
            balance_start_of_month: 0,
            balance_end_of_month_projected: 0 // Will add resultObj.projected
        };
        
        resultObj.balance_end_of_month_projected = resultObj.balance_start_of_month + resultObj.projected;

        const orphanTransactions = expensePaidTxs.filter(t => !t.payable_id && !t.receivable_id);

        const reportData = {
            meta: {
                month, year, family_id,
                generated_at: new Date().toISOString(),
                timezone: "America/Sao_Paulo",
                filters_applied: { date_basis, amount_basis, excluded_categories: exclude_categories, excluded_transaction_statuses: exclude_transaction_statuses, include_card_invoices }
            },
            income: {
                expected: { total: incomeExpectedTotal, count: incomeExpectedArray.length },
                received: { total: incomeReceivedTotal, count: incomeReceivedTxs.length },
                pending: { total: incomePendingTotal, count: Math.max(0, incomeExpectedArray.length - incomeReceivedTxs.length) },
                by_source: incomeBySource, by_category: mappedIncomeByCategory
            },
            expense: {
                expected: { total: expenseExpectedTotal, count: expenseExpectedArray.length },
                paid: { total: expensePaidTotal, count: expensePaidTxs.length },
                pending: { total: expensePendingTotal, count: Math.max(0, expenseExpectedArray.length - expensePaidTxs.length) },
                by_category: expenseByCategory
            },
            result: resultObj,
            diagnostics: {
                unknown_category_slugs: Array.from(unknown_category_slugs),
                counts: {
                    transactions_total: validTransactionsWithRef.length,
                    payables_total: validPayables.length,
                    receivables_total: validReceivables.length,
                    orphan_transactions: orphanTransactions.length
                },
                warnings: [],
                truncated_results: false
            }
        };

        try {
            await base44.asServiceRole.entities.ReportSnapshot.create({
                family_id, month, year, totals_json: JSON.stringify(reportData),
                generated_at: reportData.meta.generated_at, filters_used: reportData.meta.filters_applied
            });
        } catch(e) { console.error('Snapshot error:', e); }

        return Response.json(reportData);
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

Deno.serve(reqHandler);