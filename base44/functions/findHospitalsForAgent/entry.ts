import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query } = await req.json().catch(() => ({}));
    const hospitals = await base44.entities.Hospital.list();
    const normalizedQuery = String(query || '').toLowerCase().trim();

    const tokenize = (value) => String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const queryTokens = tokenize(normalizedQuery);

    const matches = hospitals.filter((hospital) => {
      const sigla = String(hospital.sigla || '').toLowerCase().trim();
      const nameTokens = tokenize(hospital.name);
      const allTokens = new Set([sigla, ...nameTokens]);

      return queryTokens.every((token) => Array.from(allTokens).some((candidate) => candidate.includes(token) || token.includes(candidate)));
    });

    const instruction =
      matches.length === 0
        ? 'Nenhum hospital encontrado. Peça ao usuário para informar novamente.'
        : matches.length === 1
          ? `⛔ PARE AQUI. Antes de continuar, mostre ao usuário: "Confirma o hospital ${matches[0].name} (${matches[0].sigla})?" e aguarde resposta. Só use o hospital_id após receber confirmação explícita.`
          : '⛔ PARE AQUI. Mostre ao usuário a lista numerada abaixo e aguarde escolha. Só use o hospital_id após o usuário escolher um número.';

    return Response.json({
      matches: matches.map((hospital) => ({
        id: hospital.id,
        name: hospital.name,
        sigla: hospital.sigla,
        remuneration_model: hospital.remuneration_model,
        valores: {
          valor_sd_semana: hospital.valor_sd_semana,
          valor_sn_semana: hospital.valor_sn_semana,
          valor_sd_fds: hospital.valor_sd_fds,
          valor_sn_fds: hospital.valor_sn_fds,
          valor_sobreaviso: hospital.valor_sobreaviso,
        },
      })),
      instruction,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});