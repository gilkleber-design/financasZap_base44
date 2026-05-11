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

    // Limpeza de sufixos geográficos
    const cleanDescription = (desc) => {
      if (!desc) return desc;
      // Remove sufixos de cidades e regiões
      let cleaned = desc
        .replace(/\s+(SALVADOR|SAO PAULO|VITORIA|OSASCO|BARUERI|GOIANIA|RAFAEL|MILAGRES|CURITIBA|ANA GE|MARACAS|AMELIA|LAURO|SALVADOR\s*BRA|.*BRA)$/i, '')
        .replace(/SALVADORBRA|OSASCOBRA|PAULOBRA|VITORIABRA|BARUERIBRA|etc$/gi, '')
        .trim();
      return cleaned;
    };

    // Extração de parcelas (padrão XX/YY)
    const extractInstallment = (desc) => {
      const match = desc.match(/\((\d{1,2})\/(\d{2})\)|(\d{1,2})\/(\d{2})(?:\s|$)/);
      if (match) {
        const num = parseInt(match[1] || match[3]);
        const total = parseInt(match[2] || match[4]);
        if (num <= total && total > 1 && total <= 72) {
          return { number: num, total };
        }
      }
      return null;
    };

    // Carrega regras customizadas de categorização do banco
    let categoryRules = [];
    try {
      categoryRules = await base44.entities.CategoryRule.list('-priority', 100);
    } catch {
      // Se tabela não existe, usar mapa padrão
    }

    // Mapa de categorização padrão (fallback)
    const defaultCategoryMap = {
      impostos: ['ENCARGOS', 'MULTA', 'JUROS', 'IOF', 'ANUIDADE', 'ADAPTAORG'],
      transporte: ['UBER', 'POSTO', 'AUTO POSTO', 'SHELL', 'ESTACIONAMENTO', 'LATAM', 'GOL', 'AZUL'],
      alimentacao: ['ATAKADAO', 'HIPERIDEAL', 'KIPAO', 'TRIGO', 'PARIS', 'MANAA', 'AM COMERCIO', 'CARREFOUR', 'IFOOD', 'RAPPI', 'RESTAURANTE', 'LANCHONETE', 'PADARIA', 'MC DONALDS', 'CHURRASCARIA', 'SVM COMERCIO', 'ORGANICO', 'LE BISCUIT', 'FORNARI', 'CSC VENDING', 'IFD'],
      saude: ['DROGARIA', 'PAGUE MENOS', 'HOSPCOMGOIANIA', 'FLUIR PATAMARES', 'FARMACIA', 'ULTRAFARMA', 'HOSPITAL', 'CLINICA', 'LABORATORIO', 'MENSALIDADE', 'PLANO'],
      servicos: ['GOOGLE', 'APPLE', 'CAPCUT', 'NETFLIX', 'SPOTIFY', 'AMAZON', 'YOUTUBE', 'DISNEY', 'HBO', 'PAGPRIM', 'EBN'],
      outros: []
    };

    const getCategory = (desc) => {
      const upper = (desc || '').toUpperCase();
      
      // Verifica regras customizadas primeiro
      const activeRules = categoryRules.filter(r => r.active !== false);
      for (const rule of activeRules) {
        if (upper.includes((rule.keyword || '').toUpperCase())) {
          return rule.category;
        }
      }
      
      // Fallback para mapa padrão
      for (const [cat, keywords] of Object.entries(defaultCategoryMap)) {
        if (cat === 'outros') continue;
        if (keywords.some(kw => upper.includes(kw))) return cat;
      }
      return 'outros';
    };

    // Processar itens: limpeza, deduplicação, extração de parcelas
    const deduped = [];
    const seen = new Set();

    items.forEach(item => {
      const cleaned = cleanDescription(item.description);
      const inst = extractInstallment(cleaned);
      const installmentSuffix = inst ? `_${inst.number}/${inst.total}` : '';
      const key = `${cleaned}_${Math.round(item.amount * 100)}${installmentSuffix}`;
      
      if (seen.has(key)) {
        // Encontrou duplicado — mesclar
        const existing = deduped.find(d => 
          cleanDescription(d.description) === cleaned && 
          Math.abs((d.amount || 0) - (item.amount || 0)) <= 0.01
        );
        if (existing) {
          existing.amount = (existing.amount || 0) + (item.amount || 0);
          existing.notes = (existing.notes || '') + (existing.notes ? '; ' : '') + 'Verificar Parcelamento Original (item mesclado)';
        }
      } else {
        seen.add(key);
        deduped.push({
          description: cleaned,
          amount: item.amount,
          date: item.date,
          category: getCategory(cleaned),
          installment: inst,
          notes: undefined,
        });
      }
    });

    // Criar Payables provisionados com parcelamento (mês atual + futuros)
    const payables = [];
    const { addMonths } = await import('npm:date-fns@3.6.0');

    deduped.forEach(item => {
      const baseDesc = item.description;
      const groupId = `${baseDesc}_${item.installment?.total || 1}`;

      if (item.installment && item.installment.total > 1) {
        // Gerar todas as parcelas (atual + futuras)
        const startNum = item.installment.number;
        const totalInstallments = item.installment.total;
        const monthlyAmount = item.amount;
        const itemDate = new Date(item.date + 'T12:00:00');

        for (let i = 0; i < (totalInstallments - startNum + 1); i++) {
          const futureDate = addMonths(itemDate, i);
          const futureDateStr = futureDate.toISOString().split('T')[0];

          payables.push({
            description: baseDesc,
            amount: monthlyAmount,
            due_date: futureDateStr + 'T12:00:00',
            competencia: futureDateStr,
            category: item.category || 'outros',
            status: 'provisioned',
            origin_id: card_id,
            origin_type: 'card',
            payment_modality: 'card_invoice',
            recurrent: false,
            installment_number: startNum + i,
            installment_count: totalInstallments,
            installment_total_amount: monthlyAmount * totalInstallments,
            installment_group_id: groupId,
            notes: item.notes || undefined,
          });
        }
      } else {
        // Sem parcelamento — criar apenas um lançamento
        payables.push({
          description: baseDesc,
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
        });
      }
    });

    await base44.entities.Payable.bulkCreate(payables);

    // Criar Fatura consolidada no dia do vencimento
    const cardData = await base44.entities.Card.get(card_id);
    const dueDay = cardData.due_day || 12;
    const [year, month] = ref_month.split('-');
    const dueDate = `${year}-${month}-${String(dueDay).padStart(2, '0')}`;

    const invoicePayable = await base44.entities.Payable.create({
      description: `Fatura ${cardData.name} - ${new Date(ref_month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
      amount: invoice_total,
      due_date: dueDate + 'T12:00:00',
      competencia: ref_month + '-01',
      category: 'transferencia_liquidacao',
      status: 'pending',
      origin_id: card_id,
      origin_type: 'card',
      payment_modality: 'card_invoice',
      is_card_invoice_payable: true,
      recurrent: false,
    });

    // Resumo por categoria
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
      due_date: dueDate,
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});