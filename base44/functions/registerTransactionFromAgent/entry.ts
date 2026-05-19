import { createClientFromRequest } from 'npm:@base44/sdk@0.8.29';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { 
            description, amount, type, date, origin_id, origin_type, 
            category, conciliate_id, notes 
        } = payload;

        if (!description || !amount || !type || !origin_id || !origin_type) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const isAccount = origin_type === 'account';
        const isCard = origin_type === 'card';

        let finalPayableId = null;
        let finalReceivableId = null;

        // Conciliação ou criação de novo registro-pai
        if (conciliate_id) {
            if (type === 'income') {
                await base44.entities.Receivable.update(conciliate_id, { 
                    status: 'received',
                    account_id: isAccount ? origin_id : undefined
                });
                finalReceivableId = conciliate_id;
            } else {
                await base44.entities.Payable.update(conciliate_id, { 
                    status: 'paid',
                    account_id: isAccount ? origin_id : undefined,
                    origin_id: origin_id,
                    origin_type: origin_type
                });
                finalPayableId = conciliate_id;
            }
        } else {
            // Cria provisão (não deixa transação órfã)
            if (type === 'income') {
                const rec = await base44.entities.Receivable.create({
                    description,
                    amount,
                    net_amount: amount,
                    due_date: date || new Date().toISOString().split('T')[0],
                    status: 'received',
                    account_id: isAccount ? origin_id : undefined
                });
                finalReceivableId = rec.id;
            } else {
                const pay = await base44.entities.Payable.create({
                    description,
                    amount,
                    due_date: date || new Date().toISOString().split('T')[0],
                    status: 'paid',
                    account_id: isAccount ? origin_id : undefined,
                    origin_id,
                    origin_type,
                    category: category || 'outros'
                });
                finalPayableId = pay.id;
            }
        }

        // Criar a transação vinculada e sempre com reconciled=false
        const tx = await base44.entities.Transaction.create({
            description,
            amount,
            net_amount: amount, // Assumindo igual para simplificar, a menos que venha do payload
            type,
            category: category || 'outros',
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: isCard ? origin_id : undefined,
            payable_id: finalPayableId,
            receivable_id: finalReceivableId,
            reconciled: false,
            notes: notes || 'Gerado via Assistente'
        });

        // Atualizar o pai com a transaction_id gerada
        if (finalPayableId) {
            await base44.entities.Payable.update(finalPayableId, { transaction_id: tx.id });
        }
        if (finalReceivableId) {
            await base44.entities.Receivable.update(finalReceivableId, { transaction_id: tx.id });
        }

        return Response.json({ success: true, transaction: tx });
    } catch (error) {
        console.error("Error registering transaction:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});