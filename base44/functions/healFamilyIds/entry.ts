import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ✅ SEGURANÇA 1: Verificar autenticação
    const user = await base44.auth.getMe();
    if (!user) {
      return Response.json(
        { error: "Unauthorized - user must be logged in" },
        { status: 401 }
      );
    }

    // ✅ SEGURANÇA 2: Verificar se é admin (ou owner da família)
    // Somente o owner da família pode curar os IDs da sua família
    if (!user.family_id || user.family_id !== user.id) {
      return Response.json(
        { error: "Forbidden - only family owner can heal family IDs" },
        { status: 403 }
      );
    }

    const entitiesToHeal = [
      "Receivable", "Hospital", "Category", "Shift", "Payable",
      "Transaction", "Card", "Account", "IncomeSource",
      "Budget", "Recurrence", "CategoryRule", "CardInvoice"
    ];

    let count = 0;

    for (const ent of entitiesToHeal) {
      // ✅ SEGURANÇA 3: Listar apenas registros da família do usuário
      const records = await base44.asServiceRole.entities[ent].list({
        filter: {
          family_id: user.family_id
        }
      });

      for (const r of records) {
        // Somente consertar registros órfãos (sem family_id)
        if (!r.family_id) {
          await base44.asServiceRole.entities[ent].update(r.id, {
            family_id: user.family_id
          });
          count++;
        }
      }
    }

    return Response.json({
      success: true,
      healed: count,
      message: `Curados ${count} registros para a família ${user.family_id}`
    });

  } catch (error) {
    console.error("healFamilyIds error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});