import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized - user must be logged in" }, { status: 401 });
    }

    const familyId = user.family_id || user.data?.family_id || user.id;

    const entitiesToHeal = [
      "Receivable", "Hospital", "Category", "Shift", "Payable",
      "Transaction", "Card", "Account", "IncomeSource",
      "Budget", "Recurrence", "CategoryRule", "CardInvoice"
    ];

    const healedByEntity = {};
    let count = 0;

    for (const ent of entitiesToHeal) {
      // Busca direta dos registros órfãos (sem family_id) via service role
      const orphans = await base44.asServiceRole.entities[ent].filter({ family_id: null }, '-created_date', 500);

      for (const r of orphans) {
        // Segurança: só cura registros criados pelo próprio usuário/família
        if (r.created_by_id === user.id || r.created_by_id === familyId) {
          await base44.asServiceRole.entities[ent].update(r.id, { family_id: familyId });
          count++;
          healedByEntity[ent] = (healedByEntity[ent] || 0) + 1;
        }
      }
    }

    return Response.json({
      success: true,
      healed: count,
      by_entity: healedByEntity,
      message: `Curados ${count} registros para a família ${familyId}`
    });

  } catch (error) {
    console.error("healFamilyIds error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});