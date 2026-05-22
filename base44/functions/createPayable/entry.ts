import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function toDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function cleanBasePayload(body) {
  return {
    description: String(body.description || '').trim(),
    amount: Number(body.amount),
    category: body.category || 'outros',
    category_id: body.category_id || undefined,
    origin_id: body.origin_id || undefined,
    origin_type: body.origin_type || (body.origin_id ? 'account' : undefined),
    payment_modality: body.payment_modality || 'manual',
    notes: body.notes || undefined,
  };
}

async function createPaidTransaction(base44, payable, paymentDate, originId) {
  const transaction = await base44.entities.Transaction.create({
    description: payable.description,
    amount: payable.amount,
    net_amount: payable.amount,
    type: 'expense',
    category: payable.category_id || payable.category || 'outros',
    date: paymentDate,
    source: 'manual',
    payable_id: payable.id,
    reconciled: true,
    account_id: originId,
  });

  await base44.entities.Payable.update(payable.id, { transaction_id: transaction.id });
  return transaction;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const expenseType = body.expense_type;
    const basePayload = cleanBasePayload(body);

    if (!basePayload.description || !Number.isFinite(basePayload.amount) || basePayload.amount <= 0) {
      return Response.json({ error: 'Descrição e valor válido são obrigatórios' }, { status: 400 });
    }

    if (expenseType === 'fixa') {
      const dueDay = Number(body.due_day);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        return Response.json({ error: 'Dia de vencimento inválido' }, { status: 400 });
      }

      const recurrence = await base44.entities.Recurrence.create({
        ...basePayload,
        due_day: dueDay,
        active: true,
      });

      return Response.json({ status: 'success', type: 'fixa', recurrence });
    }

    if (expenseType === 'parcelada') {
      const dueDate = toDateOnly(body.due_date);
      const installmentNumber = Number(body.installment_number || 1);
      const installmentCount = Number(body.installment_count || 1);
      const totalAmount = Number(body.installment_total_amount || basePayload.amount * installmentCount);
      const shouldPayNow = !!body.payment_date;

      if (!dueDate || !Number.isInteger(installmentNumber) || !Number.isInteger(installmentCount) || installmentNumber < 1 || installmentCount < installmentNumber) {
        return Response.json({ error: 'Dados de parcelamento inválidos' }, { status: 400 });
      }
      if (shouldPayNow && !body.origin_id) {
        return Response.json({ error: 'Origem do pagamento obrigatória para marcar como pago' }, { status: 400 });
      }

      const groupId = makeId();
      const created = [];
      const futurePayables = [];

      for (let i = 0; i <= installmentCount - installmentNumber; i++) {
        const currentNumber = installmentNumber + i;
        const installmentDueDate = addMonths(dueDate, currentNumber - 1);
        const payable = {
          ...basePayload,
          description: `${basePayload.description} (${currentNumber}/${installmentCount})`,
          due_date: `${installmentDueDate}T12:00:00`,
          competencia: installmentDueDate,
          status: shouldPayNow && i === 0 ? 'paid' : 'provisioned',
          recurrent: false,
          installment_total_amount: totalAmount,
          installment_count: installmentCount,
          installment_number: currentNumber,
          installment_group_id: groupId,
        };

        if (shouldPayNow && i === 0) {
          const firstPayable = await base44.entities.Payable.create(payable);
          await createPaidTransaction(base44, firstPayable, toDateOnly(body.payment_date), body.origin_id);
          created.push(firstPayable);
        } else {
          futurePayables.push(payable);
        }
      }

      if (futurePayables.length > 0) {
        const bulk = await base44.entities.Payable.bulkCreate(futurePayables);
        if (Array.isArray(bulk)) created.push(...bulk);
      }

      return Response.json({ status: 'success', type: 'parcelada', count: created.length, installment_group_id: groupId });
    }

    const dueDate = toDateOnly(body.due_date);
    if (!dueDate) return Response.json({ error: 'Vencimento obrigatório' }, { status: 400 });

    const isPaid = !!body.payment_date;
    if (isPaid && !body.origin_id) {
      return Response.json({ error: 'Origem do pagamento obrigatória para marcar como pago' }, { status: 400 });
    }

    const payable = await base44.entities.Payable.create({
      ...basePayload,
      due_date: `${dueDate}T12:00:00`,
      competencia: toDateOnly(body.competencia || dueDate),
      status: isPaid ? 'paid' : 'pending',
      recurrent: false,
    });

    if (isPaid) await createPaidTransaction(base44, payable, toDateOnly(body.payment_date), body.origin_id);

    return Response.json({ status: 'success', type: 'avulsa', payable });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});