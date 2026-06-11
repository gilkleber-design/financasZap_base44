import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { month, year, shift_statuses, incomes } = body;

        const existingClosures = await base44.entities.MonthlyClosure.filter({ month, year });
        if (existingClosures.some(c => c.status === 'closed')) {
            return Response.json({ error: 'M\u00eas j\u00e1 est\u00e1 fechado.' }, { status: 409 });
        }

        const rollbackQueue = [];
        const family_id = user.data?.family_id || null;

        try {
            const closure = await base44.entities.MonthlyClosure.create({
                month,
                year,
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by_id: user.id,
                total_gross: 0,
                total_net: 0,
                shift_count: 0,
                family_id
            });
            rollbackQueue.unshift(async () => await base44.entities.MonthlyClosure.delete(closure.id));

            const shifts = await base44.entities.Shift.list();
            const shiftsToUpdate = shifts.filter(s => Object.keys(shift_statuses || {}).includes(s.id));
            const hospitals = await base44.entities.Hospital.list();
            const sources = await base44.entities.IncomeSource.list();

            let shiftCount = 0;
            let totalGross = 0;
            let totalNet = 0;
            const shiftsByHospital = {};

            for (const shift of shiftsToUpdate) {
                const newStatus = shift_statuses[shift.id];
                const oldStatus = shift.status;
                const oldClosure = shift.closure_id;
                
                await base44.entities.Shift.update(shift.id, {
                    status: newStatus,
                    closure_id: closure.id
                });
                
                rollbackQueue.unshift(async () => await base44.entities.Shift.update(shift.id, {
                    status: oldStatus,
                    closure_id: oldClosure
                }));

                if (newStatus === 'done' && !shift.is_avista) {
                    shiftCount++;
                    const valor = (Number(shift.valor) || 0) + (Number(shift.valor_producao) || 0);
                    totalGross += valor;
                    
                    if (!shiftsByHospital[shift.hospital_id]) {
                        shiftsByHospital[shift.hospital_id] = { shifts: [], total: 0 };
                    }
                    shiftsByHospital[shift.hospital_id].shifts.push(shift.id);
                    shiftsByHospital[shift.hospital_id].total += valor;
                }
            }

            const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
            const due_date = `${monthPrefix}-05`;

            for (const [hospitalId, data] of Object.entries(shiftsByHospital)) {
                const hospital = hospitals.find(h => h.id === hospitalId);
                const hospitalName = hospital ? hospital.sigla || hospital.name : 'Desconhecido';
                const source = hospital ? sources.find(s => s.id === hospital.income_source_id) : null;
                const taxRate = Number(source?.default_tax_rate || 0);
                const netTotal = taxRate > 0 ? data.total * (1 - taxRate / 100) : data.total;
                
                let payment_date = due_date;
                if (hospital) {
                    const offset = hospital.payment_months_offset !== undefined ? hospital.payment_months_offset : 1;
                    const paymentMonthDate = new Date(year, month - 1 + offset, hospital.payment_day || 10);
                    payment_date = paymentMonthDate.toISOString().slice(0, 10);
                }

                const rec = await base44.entities.Receivable.create({
                    description: `${hospitalName} Plant\u00f5es ${month.toString().padStart(2, '0')}/${year}`,
                    amount: data.total,
                    net_amount: netTotal,
                    due_date: payment_date,
                    competencia: `${monthPrefix}-01`,
                    hospital_id: hospitalId,
                    income_source_id: hospital ? hospital.income_source_id : null,
                    tax_rate: taxRate,
                    status: 'pending',
                    closure_id: closure.id,
                    receivable_type: 'shifts_aggregated',
                    source_shift_ids: data.shifts,
                    family_id
                });
                rollbackQueue.unshift(async () => await base44.entities.Receivable.delete(rec.id));
                totalNet += netTotal;

                for (const shiftId of data.shifts) {
                    await base44.entities.Shift.update(shiftId, { receivable_id: rec.id });
                    rollbackQueue.unshift(async () => await base44.entities.Shift.update(shiftId, { receivable_id: null }));
                }

                if (hospital && hospital.payment_model === 'plantao_producao' && Number(hospital.valor_medio_pdt) > 0) {
                    const pdtGross = Number(hospital.valor_medio_pdt);
                    const pdtNet = taxRate > 0 ? pdtGross * (1 - taxRate / 100) : pdtGross;
                    
                    const pdtRec = await base44.entities.Receivable.create({
                        description: `${hospitalName} PDT ${month.toString().padStart(2, '0')}/${year}`,
                        amount: pdtGross,
                        net_amount: pdtNet,
                        due_date: payment_date,
                        competencia: `${monthPrefix}-01`,
                        hospital_id: hospitalId,
                        income_source_id: hospital.income_source_id,
                        tax_rate: taxRate,
                        status: 'pending',
                        closure_id: closure.id,
                        receivable_type: 'pdt_estimate',
                        family_id
                    });
                    rollbackQueue.unshift(async () => await base44.entities.Receivable.delete(pdtRec.id));
                    totalGross += pdtGross;
                    totalNet += pdtNet;
                }
            }

            for (const inc of (incomes || [])) {
                const incomeAmount = Number(inc.amount) || 0;
                let catId = inc.category_id;
                let incSrcId = null;

                if (inc.recurring_income_id) {
                    const ri = await base44.entities.RecurringIncome.get(inc.recurring_income_id);
                    if (ri) {
                        catId = ri.category_id;
                        incSrcId = ri.income_source_id;
                        
                        let updatedDueDate = due_date;
                        if (ri.due_day) {
                            updatedDueDate = new Date(year, month, ri.due_day).toISOString().slice(0, 10);
                        }

                        inc.due_date = updatedDueDate;
                        inc.description = ri.description;
                        
                        const oldLastAmount = ri.last_amount;
                        const oldLastRecAt = ri.last_received_at;
                        await base44.entities.RecurringIncome.update(ri.id, {
                            last_amount: incomeAmount,
                            last_received_at: new Date().toISOString().slice(0, 10)
                        });
                        rollbackQueue.unshift(async () => await base44.entities.RecurringIncome.update(ri.id, {
                            last_amount: oldLastAmount,
                            last_received_at: oldLastRecAt
                        }));
                    }
                }

                const source = sources.find(s => s.id === incSrcId);
                const taxRate = Number(source?.default_tax_rate || 0);
                const incomeNet = taxRate > 0 ? incomeAmount * (1 - taxRate / 100) : incomeAmount;

                const closureInc = await base44.entities.ClosureIncome.create({
                    closure_id: closure.id,
                    recurring_income_id: inc.recurring_income_id || null,
                    description: inc.description || 'Receita',
                    amount: incomeAmount,
                    category_id: catId,
                    income_source_id: incSrcId,
                    notes: inc.notes || null,
                    family_id
                });
                rollbackQueue.unshift(async () => await base44.entities.ClosureIncome.delete(closureInc.id));

                const incRec = await base44.entities.Receivable.create({
                    description: inc.description || 'Receita',
                    amount: incomeAmount,
                    net_amount: incomeNet,
                    due_date: inc.due_date || `${monthPrefix}-05`,
                    competencia: `${monthPrefix}-01`,
                    category_id: catId,
                    income_source_id: incSrcId,
                    tax_rate: taxRate,
                    status: 'pending',
                    closure_id: closure.id,
                    receivable_type: 'extra_income',
                    family_id
                });
                rollbackQueue.unshift(async () => await base44.entities.Receivable.delete(incRec.id));

                await base44.entities.ClosureIncome.update(closureInc.id, { receivable_id: incRec.id });
                totalGross += incomeAmount;
                totalNet += incomeNet;
            }

            await base44.entities.MonthlyClosure.update(closure.id, {
                total_gross: totalGross,
                total_net: totalNet,
                shift_count: shiftCount
            });

            return Response.json({ success: true, closure_id: closure.id, summary: { total_gross: totalGross, total_net: totalNet, shift_count: shiftCount } });

        } catch (innerError) {
            console.error("Error inside transaction, rolling back...", innerError);
            for (const rb of rollbackQueue) {
                try {
                    await rb();
                } catch(e) {
                    console.error("Rollback failed for an item", e);
                }
            }
            throw innerError;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});