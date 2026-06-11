import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin only' }, { status: 403 });
        }

        const shifts = await base44.entities.Shift.list();
        const receivables = await base44.entities.Receivable.list();

        const doneShifts = shifts.filter(s => s.status === 'done' && s.receivable_id);

        const closuresMap = {}; 

        for (const s of doneShifts) {
            if (!s.family_id) continue;
            const d = new Date(s.date + 'T12:00:00');
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const key = `${s.family_id}_${y}_${m}`;
            
            if (!closuresMap[key]) {
                closuresMap[key] = {
                    family_id: s.family_id,
                    month: m,
                    year: y,
                    shifts: [],
                    oldestDate: s.created_date || new Date().toISOString(),
                    receivablesSet: new Set()
                };
            }
            
            closuresMap[key].shifts.push(s);
            closuresMap[key].receivablesSet.add(s.receivable_id);
            if (s.created_date && s.created_date < closuresMap[key].oldestDate) {
                closuresMap[key].oldestDate = s.created_date;
            }
        }

        let createdCount = 0;
        let updatedReceivables = 0;
        let updatedShifts = 0;

        for (const [key, data] of Object.entries(closuresMap)) {
            const existing = await base44.entities.MonthlyClosure.filter({ 
                month: data.month, 
                year: data.year,
                "data.family_id": data.family_id 
            });
            
            let closureId;
            if (existing.length === 0) {
                const closure = await base44.entities.MonthlyClosure.create({
                    month: data.month,
                    year: data.year,
                    status: 'closed',
                    closed_at: data.oldestDate,
                    family_id: data.family_id,
                    shift_count: data.shifts.length,
                    total_gross: 0,
                    total_net: 0
                });
                closureId = closure.id;
                createdCount++;
            } else {
                closureId = existing[0].id;
            }
            
            let totalGross = 0;

            for (const s of data.shifts) {
                if (!s.closure_id) {
                    await base44.entities.Shift.update(s.id, { closure_id: closureId });
                    updatedShifts++;
                }
            }
            
            const monthPrefix = `${data.year}-${data.month.toString().padStart(2, '0')}`;
            const familyReceivables = receivables.filter(r => r.family_id === data.family_id && r.competencia && r.competencia.startsWith(monthPrefix));
            
            for (const r of familyReceivables) {
                let rType = 'shifts_aggregated';
                let cId = closureId;
                
                if (r.description && r.description.includes('PDT')) {
                    rType = 'pdt_estimate';
                } else if (!r.hospital_id) {
                    rType = 'extra_income';
                }
                
                const relShifts = data.shifts.filter(s => s.receivable_id === r.id);
                if (relShifts.length > 0 && relShifts.every(s => s.is_avista || s.shift_kind === 'avista')) {
                    rType = 'avista';
                    cId = null; // \u00c0 vista n\u00e3o pertence a um closure_id
                }
                
                const updateData = { receivable_type: rType };
                if (cId) updateData.closure_id = cId;
                
                if (cId) {
                    totalGross += Number(r.amount || 0);
                }
                
                await base44.entities.Receivable.update(r.id, updateData);
                updatedReceivables++;
            }
            
            await base44.entities.MonthlyClosure.update(closureId, {
                total_gross: totalGross,
                total_net: totalGross
            });
        }

        return Response.json({ 
            success: true, 
            message: `Migra\u00e7\u00e3o conclu\u00edda. ${createdCount} meses criados, ${updatedShifts} plant\u00f5es e ${updatedReceivables} contas a receber atualizadas.` 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});