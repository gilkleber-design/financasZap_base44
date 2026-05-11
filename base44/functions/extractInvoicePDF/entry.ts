import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    // Passo 1: transcreve o texto bruto do PDF
    const textResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Leia este PDF de fatura de cartão de crédito brasileiro e transcreva LITERALMENTE todo o texto visível, especialmente todas as linhas com datas, descrições de compras e valores. Não interprete, apenas transcreva linha por linha.`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
    });

    // Passo 2: estrutura os dados a partir do texto
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente financeiro especializado em faturas de cartão de crédito brasileiro.

Analise o texto abaixo e extraia TODOS os lançamentos/compras individuais.

TEXTO DA FATURA:
${textResult}

Para cada lançamento:
- description: descrição completa. Se houver parcela (ex: "03/12", "Parc 3/12"), inclua na descrição e preencha installment_number e installment_total
- amount: valor em reais como número positivo (converta "129,90" para 129.90)
- date: data em YYYY-MM-DD. Se tiver só dia/mês, use o ano de: ${ref_month}
- installment_number: número da parcela atual (inteiro ou null)
- installment_total: total de parcelas (inteiro ou null)
- category: uma entre: alimentacao, transporte, moradia, saude, educacao, lazer, vestuario, servicos, impostos, outros

REGRAS:
- Inclua TODOS os lançamentos, mesmo pequenos
- NÃO inclua: totais, subtotais, pagamentos anteriores, encargos, IOF, juros, anuidade, taxas
- NÃO inclua valores negativos (estornos)
- Cada linha da fatura = UMA parcela (não gere parcelas futuras)

Retorne JSON com array "items".`,
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
                installment_number: { type: ['number', 'null'] },
                installment_total: { type: ['number', 'null'] },
                category: { type: 'string' },
              },
              required: ['description', 'amount', 'date', 'category'],
            },
          },
        },
        required: ['items'],
      },
    });

    return Response.json({ items: result?.items || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});