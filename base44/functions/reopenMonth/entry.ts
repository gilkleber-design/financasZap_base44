import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { month, year, reason } = body;

        if (!reason || reason.length < 3) {
            return Response.json({ error: 'Motivo obrigat\u00f3rio e deve ter no m\u00ednimo 3 caracteres.' }, { status: 400 });
        }

        const closures = await base44.entities.MonthlyClosure.filter({ month, year });
        const closure = closures.find(c => c.status === 'closed');

        if (!closure) {
            return Response.json({ error: 'Nenhum fechamento ativo encontrado para este m\u00eas.' }, { status: 404 });
        }

        try {
            const receivables = await base44.entities.Receivable.filter({ closure_id: closure.id });
            const transactions = await base44.entities.Transaction.list();

            let deletedReceivables = 0;
            let deletedTransactions = 0;
            const accountsToRecalculate = new Set();

            for (const rec of receivables) {
                if (rec.transaction_id) {
                    const tx = transactions.find(t => t.id === rec.transaction_id);
                    if (tx) {
                        if (tx.account_id) accountsToRecalculate.add(tx.account_id);
                        await base44.entities.Transaction.delete(tx.id);
                        deletedTransactions++;
                    }
                }
                await base44.entities.Receivable.delete(rec.id);
                deletedReceivables++;
            }

            const shifts = await base44.entities.Shift.filter({ closure_id: closure.id });
            let revertedShifts = 0;
            for (const shift of shifts) {
                await base44.entities.Shift.update(shift.id, {
                    status: 'scheduled',
                    receivable_id: null,
                    closure_id: null
                });
                revertedShifts++;
            }

            const closureIncomes = await base44.entities.ClosureIncome.filter({ closure_id: closure.id });
            for (const ci of closureIncomes) {
                await base44.entities.ClosureIncome.delete(ci.id);
            }

            await base44.entities.MonthlyClosure.update(closure.id, {
                status: 'reopened',
                reopened_at: new Date().toISOString(),
                reopened_by_id: user.id,
                reopen_reason: reason
            });

            return Response.json({
                success: true,
                deleted_receivables: deletedReceivables,
                deleted_transactions: deletedTransactions,
                reverted_shifts: revertedShifts,
                recalculated_accounts: accountsToRecalculate.size
            });

        } catch (innerError) {
            console.error("Error inside reopen transaction", innerError);
            throw innerError;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});