// Backend Function do Base44 — ponte pra API do FinançasZap (Supabase).
// Recebe { acao, dados } e devolve o JSON da API sem alterar nada.
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const { acao, dados } = await req.json();

    const resp = await fetch(
      'https://wujsjspxzousguycylux.supabase.co/functions/v1/agente-api',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agente-secret': secrets.get('AGENTE_API_SECRET'),
        },
        body: JSON.stringify({ acao, dados: dados || {} }),
      },
    );

    const json = await resp.json();
    return Response.json(json);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}