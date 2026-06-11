import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { month, year } = body;

        const closures = await base44.entities.MonthlyClosure.filter({ month, year });
        const closure = closures.find(c => c.status === 'closed');

        if (!closure) {
            return Response.json({ error: 'Nenhum fechamento ativo encontrado para este m\u00eas.' }, { status: 404 });
        }

        const receivables = await base44.entities.Receivable.filter({ closure_id: closure.id });
        const paidReceivables = receivables.filter(r => r.transaction_id);

        let totalPaid = 0;
        let accountsAffected = new Set();
        
        if (paidReceivables.length > 0) {
            const transactionIds = paidReceivables.map(r => r.transaction_id);
            const transactions = await base44.entities.Transaction.list();
            const relevantTx = transactions.filter(t => transactionIds.includes(t.id));
            
            totalPaid = relevantTx.reduce((acc, t) => acc + Number(t.amount || 0), 0);
            relevantTx.forEach(t => {
                if (t.account_id) accountsAffected.add(t.account_id);
            });
        }

        const totalReceivablesAmount = receivables.reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const shifts = await base44.entities.Shift.filter({ closure_id: closure.id });
        
        const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
        const startDate = `${monthPrefix}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${monthPrefix}-${lastDay.toString().padStart(2, '0')}`;

        const allShifts = await base44.entities.Shift.filter({
            date: { $gte: startDate, $lte: endDate },
            is_avista: true
        });
        
        const avistaTotal = allShifts.reduce((acc, s) => acc + (Number(s.valor) || 0) + (Number(s.valor_producao) || 0), 0);

        return Response.json({
            receivables_to_delete: receivables.length,
            total_receivables_amount: totalReceivablesAmount,
            paid_receivables_count: paidReceivables.length,
            total_paid_amount: totalPaid,
            accounts_affected_count: accountsAffected.size,
            shifts_to_revert: shifts.length,
            avista_shifts_preserved_count: allShifts.length,
            avista_total: avistaTotal
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});