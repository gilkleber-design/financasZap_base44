import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Acionada por automação de entidade quando um Payable com is_card_invoice_payable=true
// tem seu status alterado para 'paid'. Varre os itens individuais vinculados e marca como 'paid'.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    // Pode ser chamado diretamente (com payable_id) ou via automação (com event.entity_id)
    const payableId = body.payable_id || body.event?.entity_id || body.data?.id;

    if (!payableId) {
      return Response.json({ error: 'payable_id is required' }, { status: 400 });
    }

    // Busca o Payable da fatura
    const invoicePayable = await base44.asServiceRole.entities.Payable.get(payableId);

    if (!invoicePayable) {
      return Response.json({ error: 'Payable not found' }, { status: 404 });
    }

    if (!invoicePayable.is_card_invoice_payable) {
      return Response.json({ message: 'Not a card invoice payable, skipping' });
    }

    if (invoicePayable.status !== 'paid') {
      return Response.json({ message: 'Payable not paid yet, skipping' });
    }

    // Busca o CardInvoice vinculado a este Payable
    const cardInvoices = await base44.asServiceRole.entities.CardInvoice.filter({
      payable_id: payableId,
    }, '-month', 10);

    if (cardInvoices.length === 0) {
      return Response.json({ message: 'No CardInvoice linked to this payable' });
    }

    const cardInvoice = cardInvoices[0];

    // Busca todos os itens individuais vinculados a esta fatura
    const items = await base44.asServiceRole.entities.Payable.filter({
      card_invoice_id: cardInvoice.id,
    }, '-due_date', 500);

    const provisioned = items.filter(p => p.status === 'provisioned' && !p.is_card_invoice_payable);

    // Atualiza cada item para 'paid'
    let updated = 0;
    for (const item of provisioned) {
      await base44.asServiceRole.entities.Payable.update(item.id, { status: 'paid' });
      updated++;
    }

    // Atualiza o CardInvoice para 'paid' também
    await base44.asServiceRole.entities.CardInvoice.update(cardInvoice.id, {
      status: 'paid',
      paid_date: invoicePayable.transaction_id
        ? new Date().toISOString().slice(0, 10)
        : undefined,
    });

    return Response.json({
      success: true,
      cardInvoiceId: cardInvoice.id,
      itemsUpdated: updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});