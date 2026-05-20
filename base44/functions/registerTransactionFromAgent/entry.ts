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

        // Pipeline único: registra apenas a transação real, sem auto-criação de previsão
        const tx = await base44.entities.Transaction.create({
            description,
            amount,
            net_amount: amount,
            type,
            category: category || 'outros',
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: isCard ? origin_id : undefined,
            reconciled: false,
            status: 'registered',
            notes: notes || 'Gerado via Assistente'
        });

        return Response.json({ success: true, transaction: tx });
    } catch (error) {
        console.error("Error registering transaction:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});