import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Diagnóstico: mostra a forma exata do objeto User no servidor,
// para saber onde family_id realmente vive (top-level vs data.*).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      topLevelKeys: Object.keys(user),
      family_id_top: user.family_id ?? null,
      has_data_object: typeof user.data === 'object' && user.data !== null,
      data_keys: user.data ? Object.keys(user.data) : null,
      family_id_in_data: user.data?.family_id ?? null,
      rawUser: user,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});