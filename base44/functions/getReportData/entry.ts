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

        // Fetch categories and sources bypassing RLS to ensure lookups work even if user.data.family_id is missing
        const categories = await base44.asServiceRole.entities.Category.filter({ family_id }, '-created_date', 5000);
        const incomeSources = await base44.asServiceRole.entities.IncomeSource.filter({ family_id }, '-created_date', 5000);

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

        const sixMonthsAgoObj = new Date(year, month - 6, 1);
        const sixMonthsAgoStr = `${sixMonthsAgoObj.getFullYear()}-${pad(sixMonthsAgoObj.getMonth() + 1)}-01`;

        // Fetch Data using user context (6 months window)
        const transactionsAll = await base44.entities.Transaction.filter({
            date: { $gte: sixMonthsAgoStr, $lte: endDateStr }
        }, '-date', 5000);

        const payablesAll = await base44.entities.Payable.filter({
            $or: [
                { competencia: { $gte: sixMonthsAgoStr, $lte: endDateStr } },
                { due_date: { $gte: sixMonthsAgoStr, $lte: endDateStr } }
            ]
        }, '-competencia', 5000);

        const receivablesAll = await base44.entities.Receivable.filter({
            $or: [
                { competencia: { $gte: sixMonthsAgoStr, $lte: endDateStr } },
                { due_date: { $gte: sixMonthsAgoStr, $lte: endDateStr } }
            ]
        }, '-competencia', 5000);

        // Helper to get data_ref
        const getDataRef = (item, isTx = false) => {
            if (isTx) return item.date;
            if (date_basis === 'competencia') {
                return item.competencia || item.due_date;
            }
            return item.due_date;
        };

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

        // Filter arrays for current month
        const isMonth = (dateStr) => dateStr >= startDateStr && dateStr <= endDateStr;

        const currentTransactions = transactionsAll.filter(t => isMonth(getDataRef(t, true)) && !exclude_transaction_statuses.includes(t.status));
        let validPayables = payablesAll.filter(p => isMonth(getDataRef(p, false))).map(p => ({ ...p, data_ref: getDataRef(p, false) }));
        let validReceivables = receivablesAll.filter(r => isMonth(getDataRef(r, false))).map(r => ({ ...r, data_ref: getDataRef(r, false) }));
        const validTransactionsWithRef = currentTransactions.map(t => ({ ...t, data_ref: getDataRef(t, true) }));

        // Rules handling
        if (include_card_invoices) {
            validPayables = validPayables.filter(p => !p.card_invoice_id); 
        } else {
            validPayables = validPayables.filter(p => !p.is_card_invoice_payable);
        }

        // Installments
        validPayables = validPayables.filter(p => {
            if (p.installment_total_amount && (!p.installment_number || p.installment_number <= 0)) return false;
            return true;
        });

        // Split Data correctly
        const payablesExpected = validPayables.filter(p => !isCategoryExcluded(p));
        const payablesPaid = payablesExpected.filter(p => p.status === 'paid');
        const payablesPending = payablesExpected.filter(p => p.status !== 'paid');

        const receivablesExpected = validReceivables.filter(r => !isCategoryExcluded(r));
        const receivablesReceived = receivablesExpected.filter(r => r.status === 'received');
        const receivablesPending = receivablesExpected.filter(r => r.status !== 'received');

        const expenseTxs = validTransactionsWithRef.filter(t => t.type === 'expense' && !isCategoryExcluded(t));
        const expectedPayableIds = new Set(payablesExpected.map(p => p.id));
        // Orphans are transactions that didn't pay an expected payable of THIS month
        const expenseOrphanTxs = expenseTxs.filter(t => !t.payable_id || !expectedPayableIds.has(t.payable_id));
        
        const incomeTxs = validTransactionsWithRef.filter(t => t.type === 'income' && !isCategoryExcluded(t));
        const expectedReceivableIds = new Set(receivablesExpected.map(r => r.id));
        // Orphans are transactions that didn't receive an expected receivable of THIS month
        const incomeOrphanTxs = incomeTxs.filter(t => !t.receivable_id || !expectedReceivableIds.has(t.receivable_id));

        // Totals
        const payablesExpectedTotal = payablesExpected.reduce((s, p) => s + getAmount(p), 0);
        const payablesPaidTotal = payablesPaid.reduce((s, p) => s + getAmount(p), 0);
        const payablesPendingTotal = payablesPending.reduce((s, p) => s + getAmount(p), 0);

        const receivablesExpectedTotal = receivablesExpected.reduce((s, r) => s + getAmount(r), 0);
        const receivablesReceivedTotal = receivablesReceived.reduce((s, r) => s + getAmount(r), 0);
        const receivablesPendingTotal = receivablesPending.reduce((s, r) => s + getAmount(r), 0);
        
        const receivablesPendingCount = receivablesExpected.length - receivablesReceived.length;
        const payablesPendingCount = payablesExpected.length - payablesPaid.length;

        const expenseOrphanTotal = expenseOrphanTxs.reduce((s, t) => s + getAmount(t, true), 0);
        const incomeOrphanTotal = incomeOrphanTxs.reduce((s, t) => s + getAmount(t, true), 0);

        const expectedExpenseTotal = payablesExpectedTotal;
        const realizedExpenseTotal = payablesPaidTotal + expenseOrphanTotal;
        const pendingExpenseTotal = payablesPendingTotal;

        const expectedIncomeTotal = receivablesExpectedTotal;
        const realizedIncomeTotal = receivablesReceivedTotal + incomeOrphanTotal;
        const pendingIncomeTotal = receivablesPendingTotal;

        // Categories mapping
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
                if (item.status !== 'paid' && item.status !== 'received') {
                    map[id].pending += getAmount(item);
                }
            });

            txs.forEach(item => {
                const cat = getCategory(item.category_id, item.category);
                const id = cat ? cat.id : (item.category ? String(item.category).toLowerCase() : '__sem_categoria__');
                map[id].paid += getAmount(item, true);
            });

            const roots = [];
            const byId = {};
            Object.values(map).forEach(m => {
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
                            roots.push(byId[m.parent_id]);
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

        const incomeByCategory = buildCategoryTree(incomeTxs, receivablesExpected);
        const mappedIncomeByCategory = incomeByCategory.map(n => ({
            ...n, received: n.paid, paid: undefined
        }));

        const expenseByCategory = buildCategoryTree(expenseTxs, payablesExpected);

        // Sources mapping
        const sourceMap = {};
        const warnings = [];
        let itemsWithoutSource = 0;
        let itemsWithoutSourceVal = 0;

        const getSource = (sId) => {
            const s = incomeSources.find(x => String(x.id) === String(sId));
            if (s) return s;
            if (sId === 'outras') return { name: 'Outras', type: 'pj', default_tax_rate: 0 };
            return { name: 'PJ não identificada', type: 'pj', default_tax_rate: 0 };
        };

        receivablesExpected.forEach(r => {
            const sId = r.income_source_id || 'outras';
            if (!r.income_source_id) {
                itemsWithoutSource++;
                itemsWithoutSourceVal += Number(r.amount || 0);
            }
            if (!sourceMap[sId]) {
                const s = getSource(sId);
                sourceMap[sId] = {
                    source_id: sId, source_name: s.name, source_type: s.type, expected_gross: 0, received_gross: 0,
                    expected_net: 0, received_net: 0, tax_amount: 0, tax_rate: Number(s.default_tax_rate || 0)
                };
            }
            sourceMap[sId].expected_gross += Number(r.amount || 0);
            sourceMap[sId].expected_net += Number(r.net_amount || r.amount || 0);
        });

        incomeTxs.forEach(t => {
            const sId = t.income_source_id || 'outras';
            if (!sourceMap[sId]) {
                const s = getSource(sId);
                sourceMap[sId] = {
                    source_id: sId, source_name: s.name, source_type: s.type, expected_gross: 0, received_gross: 0,
                    expected_net: 0, received_net: 0, tax_amount: 0, tax_rate: Number(s.default_tax_rate || 0)
                };
            }
            
            // Corrige o cálculo de imposto quando a transaction traz a informação diretamente
            const tGross = Number(t.amount || 0);
            let tNet = Number((t.net_amount !== undefined && t.net_amount !== null) ? t.net_amount : t.amount || 0);
            let tTaxAmount = Number(t.tax_amount || 0);
            
            // Se a transaction tem tax_rate mas não tax_amount, calcula agora
            if (t.tax_rate > 0 && tTaxAmount === 0 && tGross > 0) {
                tTaxAmount = tGross * (Number(t.tax_rate) / 100);
                if (t.net_amount === undefined || t.net_amount === null) {
                    tNet = tGross - tTaxAmount;
                }
            }

            sourceMap[sId].received_gross += tGross;
            sourceMap[sId].received_net += tNet;
            sourceMap[sId].tax_amount += tTaxAmount;
        });

        incomeOrphanTxs.forEach(t => {
            if (!t.income_source_id) {
                itemsWithoutSource++;
                itemsWithoutSourceVal += Number(t.amount || 0);
            }
        });

        if (itemsWithoutSource > 0) {
            const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemsWithoutSourceVal);
            warnings.push(`${fmt} em receitas sem income_source vinculado (${itemsWithoutSource} itens). Considere conciliá-las nas Configurações.`);
        }

        let payablesWithoutCategory = 0;
        payablesExpected.forEach(p => {
            if (!p.category_id && !p.category) payablesWithoutCategory++;
        });
        if (payablesWithoutCategory > 0) {
            warnings.push(`${payablesWithoutCategory} despesas sem categoria definida.`);
        }

        warnings.push("Saldo inicial não implementado — ver Bloco 5");

        Object.values(sourceMap).forEach(s => {
            s.tax_amount = s.expected_gross > 0 ? (s.expected_gross - s.expected_net) : (s.received_gross - s.received_net);
            if (s.tax_amount > 0 && s.expected_gross > 0 && s.tax_rate === 0) {
                s.tax_rate = Number((s.tax_amount / s.expected_gross * 100).toFixed(1));
            } else if (s.tax_amount > 0 && s.received_gross > 0 && s.tax_rate === 0) {
                s.tax_rate = Number((s.tax_amount / s.received_gross * 100).toFixed(1));
            }
        });

        const incomeBySource = Object.values(sourceMap);

        // Calculate cashflow 6m
        const cashflow_6m = [];
        const earliestTx = await base44.asServiceRole.entities.Transaction.filter({ family_id }, '+date', 1);
        const earliestDateStr = earliestTx.length > 0 && earliestTx[0].date ? earliestTx[0].date.substring(0, 7) + '-01' : new Date().toISOString().substring(0, 7) + '-01';

        for (let i = 5; i >= 0; i--) {
            const d = new Date(year, month - 1 - i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const startM = `${y}-${pad(m)}-01`;
            const endM = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
            
            const completeness = startM >= earliestDateStr ? 'complete' : 'partial';

            const checkM = (ds) => ds >= startM && ds <= endM;
            
            const mTx = transactionsAll.filter(t => checkM(getDataRef(t, true)) && !exclude_transaction_statuses.includes(t.status));
            
            const mIncTx = mTx.filter(t => t.type === 'income' && !isCategoryExcluded(t));
            const mIncGross = mIncTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const mIncNet = mIncTx.reduce((s, t) => s + (Number(t.net_amount) !== undefined ? Number(t.net_amount) : Number(t.amount || 0)), 0);

            const mExpTx = mTx.filter(t => t.type === 'expense' && !isCategoryExcluded(t));
            const mExp = mExpTx.reduce((s, t) => s + getAmount(t, true), 0);
            
            const monthLabels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

            cashflow_6m.push({
                month: m, year: y,
                label: `${monthLabels[m-1]}/${String(y).slice(-2)}`,
                income_gross: mIncGross,
                income_net: mIncNet,
                expense_gross: mExp,
                balance: mIncNet - mExp,
                data_completeness: completeness
            });
        }

        // Build items arrays
        const incomeItems = [
            ...receivablesExpected.map(r => ({ ...r, _model: 'Receivable' })),
            ...incomeOrphanTxs.map(t => ({ ...t, _model: 'Transaction' }))
        ];
        
        const expenseItems = [
            ...payablesExpected.map(p => ({ ...p, _model: 'Payable' })),
            ...expenseOrphanTxs.map(t => ({ ...t, _model: 'Transaction' }))
        ];

        // Fiscal summary
        const fiscalTotalGross = incomeBySource.reduce((s, i) => s + i.received_gross, 0);
        const fiscalTotalNet = incomeBySource.reduce((s, i) => s + i.received_net, 0);
        const fiscalTaxRetained = incomeBySource.reduce((s, i) => s + i.tax_amount, 0);

        const resultObj = {
            expected: expectedIncomeTotal - expectedExpenseTotal,
            realized: realizedIncomeTotal - realizedExpenseTotal,
            projected: expectedIncomeTotal - expectedExpenseTotal, // usually we should use actual algorithm if projected diff is needed
            balance_start_of_month: 0,
            balance_end_of_month_projected: 0 
        };
        
        const projectedIncome = realizedIncomeTotal + pendingIncomeTotal;
        const projectedExpense = realizedExpenseTotal + pendingExpenseTotal;
        resultObj.projected = projectedIncome - projectedExpense;
        resultObj.balance_end_of_month_projected = resultObj.balance_start_of_month + resultObj.projected;

        const reportData = {
            meta: {
                month, year, family_id,
                generated_at: new Date().toISOString(),
                timezone: "America/Sao_Paulo",
                filters_applied: { date_basis, amount_basis, excluded_categories: exclude_categories, excluded_transaction_statuses: exclude_transaction_statuses, include_card_invoices }
            },
            income: {
                receivables: {
                    expected: { total: receivablesExpectedTotal, count: receivablesExpected.length },
                    received: { total: receivablesReceivedTotal, count: receivablesReceived.length },
                    pending: { total: receivablesPendingTotal, count: receivablesPendingCount }
                },
                orphan_transactions: { total: incomeOrphanTotal, count: incomeOrphanTxs.length },
                expected_total: expectedIncomeTotal,
                realized_total: realizedIncomeTotal,
                pending_total: pendingIncomeTotal,
                by_source: incomeBySource, 
                by_category: mappedIncomeByCategory,
                items: incomeItems
            },
            expense: {
                payables: {
                    expected: { total: payablesExpectedTotal, count: payablesExpected.length },
                    paid: { total: payablesPaidTotal, count: payablesPaid.length },
                    pending: { total: payablesPendingTotal, count: payablesPending.length }
                },
                orphan_transactions: { total: expenseOrphanTotal, count: expenseOrphanTxs.length },
                expected_total: expectedExpenseTotal,
                realized_total: realizedExpenseTotal,
                pending_total: pendingExpenseTotal,
                by_category: expenseByCategory,
                items: expenseItems
            },
            fiscal: {
                total_gross: fiscalTotalGross,
                total_net: fiscalTotalNet,
                total_tax: fiscalTaxRetained,
                effective_rate: fiscalTotalGross > 0 ? ((fiscalTaxRetained / fiscalTotalGross) * 100).toFixed(1) + '%' : "0.0%",
                by_source: incomeBySource
            },
            cashflow_6m,
            result: resultObj,
            diagnostics: {
                unknown_category_slugs: Array.from(unknown_category_slugs),
                counts: {
                    transactions_total: currentTransactions.length,
                    transactions_without_income_source: itemsWithoutSource,
                    payables_total: validPayables.length,
                    payables_without_category: payablesWithoutCategory,
                    receivables_total: validReceivables.length,
                    orphan_transactions: expenseOrphanTxs.length + incomeOrphanTxs.length
                },
                warnings: warnings,
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