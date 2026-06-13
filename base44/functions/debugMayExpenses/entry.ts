import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

export default async function reqHandler(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const family_id = user.family_id || user.data?.family_id || user.id;
        const startMay = '2026-05-01';
        const endMay = '2026-05-31';

        const txsMay = await base44.asServiceRole.entities.Transaction.filter({
            family_id, type: 'expense', date: { $gte: startMay, $lte: endMay }
        }, '-amount', 5000);

        const payablesAll = await base44.asServiceRole.entities.Payable.filter({ family_id }, '-amount', 5000);
        const payablesMap = {};
        payablesAll.forEach(p => payablesMap[p.id] = p);

        const payablesMay = payablesAll.filter(p => {
            const ref = p.competencia || p.due_date;
            return ref >= startMay && ref <= endMay;
        });

        const top5Txs = txsMay.slice(0, 5).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date, p_id: t.payable_id }));
        
        const payablesMayPaid = payablesMay.filter(p => p.status === 'paid');
        const top5PayablesPaid = payablesMayPaid.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        const crossingTxs = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef < startMay || pRef > endMay;
        }).map(t => {
            const p = payablesMap[t.payable_id];
            return { amount: t.amount, tx_desc: t.description, tx_date: t.date, payable_desc: p.description, payable_ref: p.competencia || p.due_date };
        });

        const txByPayable = {};
        txsMay.forEach(t => {
            if (t.payable_id) {
                if (!txByPayable[t.payable_id]) txByPayable[t.payable_id] = [];
                txByPayable[t.payable_id].push(t);
            }
        });
        const duplicates = Object.entries(txByPayable).filter(([k, arr]) => arr.length > 1).map(([k, arr]) => ({
            payable_id: k,
            payable_desc: payablesMap[k]?.description,
            count: arr.length,
            total_amount: arr.reduce((s, t) => s + t.amount, 0),
            tx_dates: arr.map(t => t.date)
        }));

        const invoicesMay = payablesMay.filter(p => p.is_card_invoice_payable);
        const invoiceItemsSum = payablesMay.filter(p => p.card_invoice_id).reduce((s, p) => s + (p.amount || 0), 0);

        const orphansMay = txsMay.filter(t => !t.payable_id || !payablesMap[t.payable_id]);
        const top10Orphans = orphansMay.slice(0, 10).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));

        const payablesMayPending = payablesMay.filter(p => p.status !== 'paid');
        const top5PayablesPending = payablesMayPending.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        const a_txsPaidInMonth = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef >= startMay && pRef <= endMay;
        }).reduce((s, t) => s + (t.amount || 0), 0);

        const b_txsPaidOtherMonth = crossingTxs.reduce((s, c) => s + c.amount, 0);
        const c_orphansSum = orphansMay.reduce((s, t) => s + (t.amount || 0), 0);
        const d_payablesPaidSum = payablesMayPaid.reduce((s, p) => s + (p.amount || 0), 0);

        return Response.json({
            1: { title: "1. Transactions Expense (date=Mai/2026)", sum: txsMay.reduce((s, t) => s + (t.amount || 0), 0), top5: top5Txs },
            2: { title: "2. Payables (ref=Mai/2026, status=paid)", sum: d_payablesPaidSum, top5: top5PayablesPaid },
            3: { title: "3. Cruzamento (Tx Mai -> Payable Outro Mês)", count: crossingTxs.length, sum: b_txsPaidOtherMonth, items: crossingTxs },
            4: { title: "4. Duplicidades (Múltiplas Txs -> Mesmo Payable)", count: duplicates.length, sum_of_txs: duplicates.reduce((s,d)=>s+d.total_amount,0), items: duplicates },
            5: { title: "5. Cartões", invoices_count: invoicesMay.length, invoices_sum: invoicesMay.reduce((s,p)=>s+p.amount,0), items_sum: invoiceItemsSum },
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
}

Deno.serve(reqHandler);