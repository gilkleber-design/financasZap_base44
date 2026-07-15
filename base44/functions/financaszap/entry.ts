Deno.serve(async (req) => {
  const body = await req.json();
  const { acao, dados } = body;

  console.log('INPUT:', JSON.stringify({ acao, dados: dados || {} }));

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

  const respBody = await resp.text();
  console.log('STATUS:', resp.status);
  console.log('RESPONSE:', respBody);

  return Response.json(JSON.parse(respBody));
});