import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Lê todos os dados do Dashboard filtrando EXPLICITAMENTE por family_id,
// sem depender da RLS da plataforma (que não isola campos custom como family_id).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const familyId = user.family_id || user.id;
    const svc = base44.asServiceRole.entities;

    const [transactions, payables, receivables, budgets, categories, hospitals] = await Promise.all([
      svc.Transaction.filter({ family_id: familyId }, '-date', 2000),
      svc.Payable.filter({ family_id: familyId }, '-due_date', 1000),
      svc.Receivable.filter({ family_id: familyId }, '-due_date', 1000),
      svc.Budget.filter({ family_id: familyId }, '-year', 500),
      svc.Category.filter({ family_id: familyId }, 'name', 500),
      svc.Hospital.filter({ family_id: familyId }, 'name', 500),
    ]);

    return Response.json({ transactions, payables, receivables, budgets, categories, hospitals });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});