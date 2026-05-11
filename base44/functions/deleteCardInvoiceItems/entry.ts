import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { card_name, ref_month } = await req.json();
    if (!card_name || !ref_month) {
      return Response.json({ error: 'card_name e ref_month são obrigatórios' }, { status: 400 });
    }

    // Encontra o cartão pelo nome
    const cards = await base44.entities.Card.list();
    const card = cards.find(c => c.name?.toLowerCase().includes(card_name.toLowerCase()));
    if (!card) {
      return Response.json({ error: `Cartão "${card_name}" não encontrado` }, { status: 404 });
    }

    // Encontra todos os Payables deste cartão para este mês
    const allPayables = await base44.entities.Payable.list('-due_date', 1000);
    const toDelete = allPayables.filter(p =>
      p.origin_id === card.id &&
      p.origin_type === 'card' &&
      !p.is_card_invoice_payable &&
      (p.competencia || p.due_date || '').startsWith(ref_month)
    );

    // Deleta todos os Payables encontrados
    for (const p of toDelete) {
      await base44.entities.Payable.delete(p.id);
    }

    return Response.json({
      status: 'success',
      card_name: card.name,
      ref_month,
      deleted_count: toDelete.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});