import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoicePayableId } = await req.json();
    if (!invoicePayableId) return Response.json({ error: 'invoicePayableId obrigatório' }, { status: 400 });

    // Busca o Payable consolidado (fatura)
    const invoicePayable = await base44.entities.Payable.get(invoicePayableId);
    if (!invoicePayable || !invoicePayable.is_card_invoice_payable) {
      return Response.json({ error: 'Fatura não encontrada ou inválida' }, { status: 404 });
    }

    // Busca a CardInvoice vinculada
    const cardInvoices = await base44.entities.CardInvoice.filter({
      payable_id: invoicePayableId,
    }, '-month', 10);

    if (cardInvoices.length === 0) {
      return Response.json({ error: 'CardInvoice não encontrada' }, { status: 404 });
    }

    const cardInvoice = cardInvoices[0];

    // Busca todos os itens provisionados vinculados a esta fatura
    const items = await base44.entities.Payable.filter({
      origin_id: invoicePayable.origin_id,
      origin_type: 'card',
      card_invoice_id: cardInvoice.id,
      status: 'provisioned',
    }, '-due_date', 500);

    // Atualiza todos para 'paid'
    const updatePromises = items.map(item =>
      base44.entities.Payable.update(item.id, { status: 'paid' })
    );

    await Promise.all(updatePromises);

    return Response.json({
      status: 'success',
      itemsUpdated: items.length,
      message: `${items.length} itens marcados como pagos`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});