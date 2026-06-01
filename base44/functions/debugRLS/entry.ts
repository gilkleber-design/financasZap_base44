import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // O que o servidor enxerga sobre o usuário autenticado
    const userView = {
      id: user.id,
      email: user.email,
      role: user.role,
      family_id: user.family_id,
      family_id_in_data: user.data?.family_id,
    };

    // Leitura SEM service role (sujeita à RLS) — o que o usuário "vê"
    const rlsTransactions = await base44.entities.Transaction.list('-date', 5);

    // Leitura COM service role, filtrando explicitamente pela família do usuário
    const myFamilyId = user.family_id || user.id;
    const explicitTransactions = await base44.asServiceRole.entities.Transaction.filter(
      { family_id: myFamilyId },
      '-date',
      5
    );

    return Response.json({
      userView,
      rlsCount: rlsTransactions.length,
      rlsFamilyIds: [...new Set(rlsTransactions.map(t => t.family_id))],
      explicitCount: explicitTransactions.length,
      explicitFamilyIds: [...new Set(explicitTransactions.map(t => t.family_id))],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});