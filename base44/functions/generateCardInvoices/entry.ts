import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada manual por qualquer usuário autenticado ou automação agendada (sem user)
    try {
      const user = await base44.auth.me();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch (_) {
      // chamada de automação agendada (sem session) — permitida
    }

    const today = new Date();
    const todayDay = today.getDate();
    const todayStr = today.toISOString().slice(0, 10);

    const { forceCardId, forceMonth } = await req.json().catch(() => ({}));

    // Busca todos os cartões de crédito
    const cards = await base44.asServiceRole.entities.Card.list('name', 200);
    const creditCards = cards.filter(c => c.type === 'credit' || c.type === 'both');

    const results = [];

    for (const card of creditCards) {
      // Se forceCardId especificado, só processa esse cartão
      if (forceCardId && card.id !== forceCardId) continue;

      const closingDay = card.closing_day || 1;

      // Só processa se hoje é dia de fechamento (ou se forçado)
      if (!forceCardId && todayDay !== closingDay) continue;

      // Determina o mês de referência da fatura
      // Itens comprados antes do fechamento pertencem ao mês atual
      const refMonth = forceMonth || today.toISOString().slice(0, 7) + '-01';
      const refMonthStr = refMonth.slice(0, 7); // YYYY-MM

      // Verifica se já existe fatura para este cartão/mês
      const existingInvoices = await base44.asServiceRole.entities.CardInvoice.filter({
        card_id: card.id,
      }, '-month', 50);

      const alreadyExists = existingInvoices.some(inv =>
        inv.month && inv.month.startsWith(refMonthStr)
      );

      if (alreadyExists) {
        results.push({ card: card.name, status: 'already_exists', month: refMonthStr });
        continue;
      }

      // Busca itens provisionados neste cartão que ainda não têm card_invoice_id
      const allPayables = await base44.asServiceRole.entities.Payable.filter({
        origin_id: card.id,
        origin_type: 'card',
        status: 'provisioned',
      }, '-due_date', 500);

      // Filtra itens do mês de competência da fatura
      const invoiceItems = allPayables.filter(p => {
        if (p.is_card_invoice_payable) return false;
        if (p.card_invoice_id) return false; // já vinculado a outra fatura
        const comp = p.competencia || p.due_date;
        if (!comp) return false;
        return comp.startsWith(refMonthStr);
      });

      if (invoiceItems.length === 0) {
        results.push({ card: card.name, status: 'no_items', month: refMonthStr });
        continue;
      }

      const totalAmount = invoiceItems.reduce((s, p) => s + (p.amount || 0), 0);

      // Calcula datas de fechamento e vencimento
      const [year, month] = refMonthStr.split('-').map(Number);
      const closingDate = new Date(year, month - 1, closingDay);
      const closingDateStr = closingDate.toISOString().slice(0, 10);

      let dueDateStr = null;
      if (card.due_day) {
        // vencimento no mês seguinte
        const dueDate = new Date(year, month, card.due_day);
        dueDateStr = dueDate.toISOString().slice(0, 10);
      }

      // Cria o Payable consolidado "Fatura [CARTÃO]" no Contas a Pagar
      const monthLabel = new Date(refMonthStr + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
      const invoicePayable = await base44.asServiceRole.entities.Payable.create({
        description: `Fatura ${card.name} - ${monthLabel}`,
        amount: Math.round(totalAmount * 100) / 100,
        due_date: (dueDateStr || closingDateStr) + 'T12:00:00',
        competencia: refMonth, // mês de referência da fatura (YYYY-MM-01)
        category: 'transferencia_liquidacao',
        status: 'pending',
        payment_modality: 'card_invoice',
        origin_id: card.id,
        origin_type: 'card',
        is_card_invoice_payable: true,
        notes: `Fatura ${card.name} — ${refMonthStr}`,
      });

      // Cria o registro CardInvoice
      const cardInvoice = await base44.asServiceRole.entities.CardInvoice.create({
        card_id: card.id,
        month: refMonth,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: 'closed',
        closing_date: closingDateStr,
        due_date: dueDateStr || closingDateStr,
        payable_id: invoicePayable.id,
      });

      // Vincula os itens individuais à fatura criada
      for (const item of invoiceItems) {
        await base44.asServiceRole.entities.Payable.update(item.id, {
          card_invoice_id: cardInvoice.id,
        });
      }

      results.push({
        card: card.name,
        status: 'created',
        month: refMonthStr,
        items: invoiceItems.length,
        total: totalAmount,
        invoicePayableId: invoicePayable.id,
        cardInvoiceId: cardInvoice.id,
      });
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});