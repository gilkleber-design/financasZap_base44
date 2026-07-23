import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }
    const secret = req.headers.get('x-agente-secret');
    if (!secret || secret !== Deno.env.get('AGENTE_API_SECRET')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const base44 = createClientFromRequest(req);
    const client = base44.asServiceRole ?? base44;
    const url = client.agents.getWhatsAppConnectURL('financas_zap');
    return Response.json({ url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});