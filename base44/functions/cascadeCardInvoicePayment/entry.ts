import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Acionada por automação de entidade quando um Payable com is_card_invoice_payable=true
// tem seu status alterado para 'paid'. Os itens individuais do cartão NÃO viram 'paid':
// permanecem provisionados até a conciliação da fatura, quando passam a 'conciliated'.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    if (invoicePayable.family_id !== (user.family_id || user.id) && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Payable belongs to another family' }, { status: 403 });
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

    // Atualiza cada item para 'conciliated' mantendo a lógica de cartão
    let updated = 0;
    for (const item of provisioned) {
      await base44.asServiceRole.entities.Payable.update(item.id, { status: 'conciliated' });
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