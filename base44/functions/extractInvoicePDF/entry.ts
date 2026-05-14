import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function sanitizeDescription(desc) {
  if (!desc) return desc;
  let cleaned = desc.replace(/([A-Z])\s(?=[A-Z]\s|[A-Z]$)/g, '$1'); 
  const geoSuffixes = [/\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /[A-Z]{3,}BRA$/, /\s+BRA$/i, /\s+BR$/i];
  cleaned = cleaned.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json(); // ref_month vem como "2026-05"

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extraia os lançamentos desta fatura de cartão de crédito.
      IMPORTANTE: O mês de referência da fatura é ${ref_month}.
      - Para cada item, extraia a data original (DD/MM).
      - Se o mês da compra for maior que o mês da fatura (ex: compra em Dezembro na fatura de Maio), o ano é o anterior ao de ${ref_month}.
      - Caso contrário, o ano é o mesmo de ${ref_month}.
      - Identifique parcelas (01/10) e retorne installment_number e installment_total.
      - Una letras separadas e limpe nomes de cidades.`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                amount: { type: 'number' },
                date: { type: 'string' }, // YYYY-MM-DD
                installment_number: { type: 'number' },
                installment_total: { type: 'number' },
                category: { type: 'string' }
              },
              required: ['description', 'amount', 'date']
            }
          },
          invoice_total: { type: 'number' }
        }
      }
    });

    return Response.json({
      items: result.items || [],
      integrity_check: { invoice_total: result.invoice_total || 0 }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});