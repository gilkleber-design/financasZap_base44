import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { items, card_id, ref_month, invoice_total } = await req.json();
    if (!items || !card_id || !ref_month || !invoice_total) {
      return Response.json({ error: 'items, card_id, ref_month, invoice_total são obrigatórios' }, { status: 400 });
    }

    // Mapa de categorização semântica
    const categoryMap = {
      impostos: ['ENCARGOS', 'MULTA', 'JUROS', 'IOF', 'ANUIDADE', 'ADAPTAORG'],
      transporte: ['UBER', 'AUTO POSTO', 'SHELL', 'ESTACIONAMENTO', 'POSTO', 'LATAM', 'GOL', 'AZUL'],
      alimentacao: ['ATAKADAO', 'HIPERIDEAL', 'KIPAO', 'TRIGO', 'PARIS', 'MANAA', 'AM COMERCIO', 'CARREFOUR', 'IFOOD', 'RAPPI', 'RESTAURANTE', 'LANCHONETE', 'PADARIA', 'MC DONALDS', 'CHURRASCARIA', 'SVM COMERCIO', 'ORGANICO', 'LE BISCUIT', 'FORNARI', 'CSC VENDING', 'IFD'],
      saude: ['DROGARIA', 'PAGUE MENOS', 'HOSPCOMGOIANIA', 'FLUIR PATAMARES', 'FARMACIA', 'ULTRAFARMA', 'HOSPITAL', 'CLINICA', 'LABORATORIO', 'MENSALIDADE', 'PLANO'],
      servicos: ['GOOGLE', 'APPLE', 'CAPCUT', 'NETFLIX', 'SPOTIFY', 'AMAZON', 'YOUTUBE', 'DISNEY', 'HBO', 'PAGPRIM', 'EBN'],
      outros: []
    };

    const getCategory = (desc) => {
      const upper = (desc || '').toUpperCase();
      for (const [cat, keywords] of Object.entries(categoryMap)) {
        if (cat === 'outros') continue;
        if (keywords.some(kw => upper.includes(kw))) return cat;
      }
      return 'outros';
    };

    // Detectar duplicidades (mesmo nome + valor idêntico ou 1 centavo de diferença)
    const deduped = [];
    const seen = new Set();

    items.forEach(item => {
      const key = `${item.description}_${Math.round(item.amount * 100)}`;
      
      if (seen.has(key)) {
        // Encontrou duplicado — mesclar
        const existing = deduped.find(d => 
          d.description === item.description && 
          Math.abs((d.amount || 0) - (item.amount || 0)) <= 0.01
        );
        if (existing) {
          existing.amount = (existing.amount || 0) + (item.amount || 0);
          existing.notes = (existing.notes || '') + (existing.notes ? '; ' : '') + 'Verificar Parcelamento Original (item mesclado)';
        }
      } else {
        seen.add(key);
        deduped.push({
          ...item,
          category: getCategory(item.description),
          status: 'provisioned',
        });
      }
    });

    // Criar Payables provisionados
    const payables = deduped.map(item => ({
      description: item.description,
      amount: item.amount,
      due_date: item.date ? new Date(item.date).toISOString().split('T')[0] + 'T12:00:00' : ref_month + '-01T12:00:00',
      competencia: item.date ? new Date(item.date).toISOString().split('T')[0] : ref_month + '-01',
      category: item.category || 'outros',
      status: 'provisioned',
      origin_id: card_id,
      origin_type: 'card',
      payment_modality: 'card_invoice',
      recurrent: false,
      notes: item.notes || undefined,
    }));

    await base44.entities.Payable.bulkCreate(payables);

    // Criar Fatura consolidada em Contas a Pagar
    const cardData = await base44.entities.Card.get(card_id);
    const invoicePayable = await base44.entities.Payable.create({
      description: `Fatura ${cardData.name} - ${new Date(ref_month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
      amount: invoice_total,
      due_date: ref_month + '-15T12:00:00',
      competencia: ref_month + '-01',
      category: 'transferencia_liquidacao',
      status: 'pending',
      origin_id: card_id,
      origin_type: 'card',
      payment_modality: 'card_invoice',
      is_card_invoice_payable: true,
      recurrent: false,
    });

    // Agrupar por categoria para retornar resumo
    const summary = {};
    deduped.forEach(item => {
      if (!summary[item.category]) summary[item.category] = 0;
      summary[item.category] += item.amount;
    });

    return Response.json({
      status: 'success',
      payables_created: payables.length,
      invoice_payable_id: invoicePayable.id,
      total_amount: invoice_total,
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});