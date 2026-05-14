import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function sanitizeDescription(desc) {
  if (!desc) return desc;
  // Une letras separadas (G I L -> GIL)
  let cleaned = desc.replace(/([A-Z])\s(?=[A-Z]\s|[A-Z]$)/g, '$1'); 
  const geoSuffixes = [/\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /[A-Z]{3,}BRA$/, /\s+BRA$/i, /\s+BR$/i];
  cleaned = cleaned.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      prompt: `Extraia os lançamentos desta fatura de cartão de crédito.
      Referência: ${ref_month}.
      REGRAS:
      - Extraia DATA (DD/MM) e VALOR. Ignore propagandas e informativos.
      - Una letras separadas por espaços.
      - Identifique parcelas (ex: 01/10) para installment_number e installment_total.
      - Estornos e Pagamentos da fatura anterior: amount NEGATIVO.`,
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
                date: { type: 'string' },
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

    const items = (result.items || []).map(item => ({
      ...item,
      description: sanitizeDescription(item.description)
    }));

    return Response.json({ items, integrity_check: { invoice_total: result.invoice_total || 0 } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});