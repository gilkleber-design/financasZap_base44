import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('Iniciando varredura de órfãos...');

    const transactions = await base44.asServiceRole.entities.Transaction.filter({ type: 'expense' }, '-date', 500);
    const payables = await base44.asServiceRole.entities.Payable.list('-created_date', 500);
    const payableTransactionIds = new Set(
      payables
        .filter((payable) => payable.transaction_id)
        .map((payable) => payable.transaction_id)
    );

    const orphans = transactions.filter((transaction) => {
      const hasPayableId = !!transaction.payable_id;
      const hasPayableBacklink = payableTransactionIds.has(transaction.id);
      return !hasPayableId && !hasPayableBacklink;
    });

    console.log(`Encontrados ${orphans.length} focos de infecção. Iniciando sutura...`);

    let fixCount = 0;
    const fixed = [];

    for (const row of orphans) {
      const payable = await base44.asServiceRole.entities.Payable.create({
        description: row.description,
        amount: row.amount,
        category: row.category || 'outros',
        due_date: row.date,
        status: 'paid',
        recurrent: false,
        transaction_id: row.id,
        notes: 'Criado automaticamente para corrigir transaction órfã',
      });

      await base44.asServiceRole.entities.Transaction.update(row.id, {
        payable_id: payable.id,
        reconciled: true,
      });

      fixCount++;
      fixed.push({
        transaction_id: row.id,
        payable_id: payable.id,
        description: row.description,
        amount: row.amount,
        date: row.date,
      });
      console.log(`[+] Resolvido: ${row.description} - R$ ${row.amount}`);
    }

    return Response.json({
      message: `Limpeza concluída. ${fixCount} transações corrigidas.`,
      fixed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});