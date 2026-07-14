Deno.serve(async (req) => {
  const { acao, dados } = await req.json();

  const resp = await fetch(
    'https://wujsjspxzousguycylux.supabase.co/functions/v1/agente-api',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agente-secret': Deno.env.get('AGENTE_API_SECRET'),
      },
      body: JSON.stringify({ acao, dados: dados || {} }),
    },
  );

  return Response.json(await resp.json());
});