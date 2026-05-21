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
        const safeType = type === 'receipt' ? 'income' : type; // defensive fallback

        // Create transaction with proper reconciliation status
        const txData = {
            description,
            amount,
            net_amount: amount,
            type: safeType,
            category: category || undefined,
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: isCard ? origin_id : undefined,
            reconciled: !!conciliate_id,
            status: conciliate_id ? 'conciliated' : 'registered',
            notes: notes || 'Gerado via Assistente'
        };

        if (conciliate_id) {
            if (safeType === 'income') {
                txData.receivable_id = conciliate_id;
                const recs = await base44.entities.Receivable.filter({ id: conciliate_id });
                if (recs && recs.length > 0) txData.description = recs[0].description;
            } else {
                txData.payable_id = conciliate_id;
                const pays = await base44.entities.Payable.filter({ id: conciliate_id });
                if (pays && pays.length > 0) txData.description = pays[0].description;
            }
        }

        const tx = await base44.entities.Transaction.create(txData);

        // Auto-update conciliation target if ID was provided
        if (conciliate_id) {
            if (safeType === 'income') {
                await base44.entities.Receivable.update(conciliate_id, {
                    status: 'received',
                    transaction_id: tx.id
                });
            } else {
                await base44.entities.Payable.update(conciliate_id, {
                    status: 'paid',
                    transaction_id: tx.id
                });
            }
        }

        return Response.json({ success: true, transaction: tx });
    } catch (error) {
        console.error("Error registering transaction:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});