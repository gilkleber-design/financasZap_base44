import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { month, year } = body;

        const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
        const startDate = `${monthPrefix}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${monthPrefix}-${lastDay.toString().padStart(2, '0')}`;

        const shifts = await base44.entities.Shift.filter({
            date: { $gte: startDate, $lte: endDate },
        });

        // Filter out avista
        const closableShifts = shifts.filter(s => !s.is_avista && s.status !== 'passed' && s.status !== 'cancelled' && !s.receivable_id);
        
        let shiftTotal = closableShifts.reduce((acc, s) => acc + (Number(s.valor) || 0) + (Number(s.valor_producao) || 0), 0);

        const recurringIncomes = await base44.entities.RecurringIncome.filter({ active: true });

        const suggestedIncomes = recurringIncomes.map(ri => {
            let suggestedAmount = ri.default_amount;
            if (ri.lock_amount) {
                suggestedAmount = ri.default_amount;
            } else if (ri.remember_last && ri.last_amount !== undefined && ri.last_amount !== null) {
                suggestedAmount = ri.last_amount;
            }

            return {
                ...ri,
                suggested_amount: suggestedAmount
            };
        });

        return Response.json({
            shift_count: closableShifts.length,
            shift_total: shiftTotal,
            recurring_incomes: suggestedIncomes,
            total_expected: shiftTotal + suggestedIncomes.reduce((a, b) => a + (b.pre_check ? b.suggested_amount : 0), 0)
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});