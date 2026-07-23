Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const secret = req.headers.get('x-agente-secret');
    if (!secret || secret !== Deno.env.get('AGENTE_API_SECRET')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    const url = `https://base44.app/api/apps/${appId}/agents/financas_zap/whatsapp`;

    return Response.json({ url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});