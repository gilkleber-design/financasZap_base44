import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { targetBalance, date } = body;

        if (targetBalance === undefined || targetBalance === null || !date) {
            return Response.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 });
        }

        // Fetch all transactions up to the specified date to compute current balance
        const allTx = await base44.entities.Transaction.list('date', 10000);
        
        let currentBalance = 0;
        allTx.forEach(t => {
            if (t.status !== 'ignored' && t.date <= date) {
                if (t.type === 'income') {
                    currentBalance += (t.net_amount || t.amount);
                } else if (t.type === 'expense') {
                    currentBalance -= t.amount;
                }
            }
        });

        const difference = targetBalance - currentBalance;

        // If difference is negligible, return success
        if (Math.abs(difference) < 0.01) {
             return Response.json({ success: true, message: 'O saldo já está correto.', difference: 0 });
        }

        const newTransaction = {
            description: "Ajuste de Saldo Inicial",
            amount: Math.abs(difference),
            type: difference > 0 ? "income" : "expense",
            date: date,
            status: "registered",
            category: "outros", 
            source: "manual",
            notes: "Ajuste gerado automaticamente pelo sistema."
        };

        const created = await base44.entities.Transaction.create(newTransaction);

        return Response.json({ success: true, difference, created });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});