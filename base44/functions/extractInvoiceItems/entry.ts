import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, refMonth, refMonthLabel } = await req.json();
    if (!file_url || !refMonth) return Response.json({ error: 'file_url e refMonth são obrigatórios' }, { status: 400 });

    // Passo 1: transcrição literal do PDF
    const transcription = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um leitor de documentos PDF. Leia este PDF de fatura de cartão de crédito e transcreva LITERALMENTE todo o conteúdo de texto visível, linha por linha, preservando a formatação original. Foque especialmente nas linhas de lançamentos que contêm datas, descrições de compras e valores monetários. Transcreva tudo sem omitir nada.`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
    });

    // Passo 2: extração estruturada a partir do texto
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente financeiro especializado em faturas de cartão de crédito brasileiro.

Abaixo está o texto transcrito de uma fatura. Extraia TODOS os lançamentos/compras individuais e retorne em JSON.

TEXTO DA FATURA:
${transcription}

CAMPOS A EXTRAIR por lançamento:
- description: descrição completa. Se tiver parcela (ex: "03/12", "Parc 3/12"), mantenha na descrição
- amount: valor positivo em número decimal ponto (ex: 129.90). Converta vírgulas: "129,90" → 129.90
- date: formato YYYY-MM-DD. Se tiver só dia/mês use o ano de ${refMonth.slice(0, 4)}
- installment_number: número da parcela atual (inteiro) ou null
- installment_total: total de parcelas (inteiro) ou null
- category: uma entre: alimentacao, transporte, moradia, saude, educacao, lazer, vestuario, servicos, impostos, outros

REGRAS:
- Inclua TODOS os lançamentos individuais, mesmo pequenos
- EXCLUA: totais, subtotais, pagamentos anteriores, juros, IOF, encargos, taxas, créditos
- EXCLUA valores negativos (estornos)
- Para compras parceladas: cada linha da fatura = 1 parcela (não gere parcelas futuras)
- Mês de referência: ${refMonthLabel || refMonth}`,
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