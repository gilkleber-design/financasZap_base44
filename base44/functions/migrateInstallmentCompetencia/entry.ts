import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const execute = body.execute === true;

        // Busca todos os payables com installment_group_id e installment_number > 1
        const allPayables = await base44.entities.Payable.filter({
            status: 'pending'
        }, '+due_date', 5000);

        // Filtra: tem installment_group_id, installment_number > 1
        const installmentPayables = allPayables.filter(p =>
            p.installment_group_id &&
            p.installment_number != null &&
            Number(p.installment_number) > 1
        );

        // Detecta quais têm competencia errada (não bate com o mês do due_date)
        const toUpdate = installmentPayables.filter(p => {
            if (!p.due_date) return false;
            const dueMonth = p.due_date.substring(0, 7) + '-01'; // YYYY-MM-01
            const currentComp = p.competencia ? p.competencia.substring(0, 7) + '-01' : null;
            return currentComp !== dueMonth;
        }).map(p => {
            const competencia_nova = p.due_date.substring(0, 7) + '-01';
            return {
                id: p.id,
                description: p.description,
                installment_number: p.installment_number,
                installment_group_id: p.installment_group_id,
                due_date: p.due_date,
                competencia_atual: p.competencia || null,
                competencia_nova
            };
        });

        if (!execute) {
            // PREVIEW MODE — não atualiza nada
            return Response.json({
                mode: 'preview',
                to_update_count: toUpdate.length,
                sample: toUpdate.slice(0, 20),
                note: 'Para executar, envie { "execute": true } no body.'
            });
        }

        // EXECUTE MODE — só roda se chamado com execute: true
        let updated = 0;
        const errors = [];
        for (const item of toUpdate) {
            try {
                await base44.entities.Payable.update(item.id, { competencia: item.competencia_nova });
                updated++;
            } catch (e) {
                errors.push({ id: item.id, error: e.message });
            }
        }

        return Response.json({
            mode: 'execute',
            updated,
            errors_count: errors.length,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});