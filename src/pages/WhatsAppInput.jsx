import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Upload, Mic, Image, FileText, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import TransactionPreviewModal from '@/components/whatsapp/TransactionPreviewModal';

export default function WhatsAppInput() {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState(null);
  const queryClient = useQueryClient();

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 100),
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 100),
  });

  const processInput = async (inputText, fileUrl = null, fileType = null) => {
    setProcessing(true);
    const pendingPayables = payables.filter(p => p.status === 'pending');
    const pendingReceivables = receivables.filter(r => r.status === 'pending');

    const prompt = `Você é um assistente financeiro pessoal brasileiro. Analise a mensagem abaixo e extraia as informações de um lançamento financeiro.

MENSAGEM/CONTEÚDO: "${inputText || 'Analise o arquivo anexado'}"
${fileUrl ? `ARQUIVO ANEXADO: ${fileUrl} (tipo: ${fileType})` : ''}

FONTES DE RENDA CADASTRADAS:
${incomeSources.map(s => `- ${s.name} (${s.type.toUpperCase()}, alíquota padrão: ${s.default_tax_rate || 0}%)`).join('\n') || 'Nenhuma cadastrada'}

CONTAS A PAGAR PENDENTES (para conciliação automática):
${pendingPayables.map(p => `- ID:${p.id} | ${p.description} | R$${p.amount} | venc:${p.due_date}`).join('\n') || 'Nenhuma'}

CONTAS A RECEBER PENDENTES (para conciliação automática):
${pendingReceivables.map(r => `- ID:${r.id} | ${r.description} | R$${r.amount} | venc:${r.due_date}`).join('\n') || 'Nenhuma'}

Extraia e retorne em JSON:
- description: string (descrição clara do lançamento)
- amount: number (valor bruto)
- net_amount: number (valor líquido - se PJ, desconte o imposto; se CLT ou despesa, igual ao amount)
- type: "income" | "expense"
- category: uma de: alimentacao, transporte, moradia, saude, educacao, lazer, vestuario, servicos, impostos, salario_clt, receita_pj, outros
- date: string no formato YYYY-MM-DD (use a data mencionada ou hoje: ${format(new Date(), 'yyyy-MM-dd')})
- tax_rate: number ou null (alíquota % se for PJ)
- tax_amount: number ou null (valor do imposto)
- payable_id: string ou null (ID da conta a pagar que este lançamento quita, se identificado)
- receivable_id: string ou null (ID da conta a receber que este lançamento concilia, se identificado)
- reconciled: boolean (true se conciliou com alguma conta)
- income_source_id: string ou null (ID da fonte de renda, se receita)
- confidence: number 0-1 (confiança na extração)
- notes: string (observações ou dúvidas)`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: fileUrl ? [fileUrl] : undefined,
      response_json_schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
          net_amount: { type: 'number' },
          type: { type: 'string' },
          category: { type: 'string' },
          date: { type: 'string' },
          tax_rate: { type: 'number' },
          tax_amount: { type: 'number' },
          payable_id: { type: 'string' },
          receivable_id: { type: 'string' },
          reconciled: { type: 'boolean' },
          income_source_id: { type: 'string' },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        }
      }
    });

    setPreview({ ...result, raw_message: inputText, source: fileUrl ? (fileType === 'pdf' ? 'whatsapp_pdf' : 'whatsapp_photo') : 'whatsapp_text' });
    setProcessing(false);
  };

  const handleText = async () => {
    if (!text.trim()) return;
    await processInput(text);
  };

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setProcessing(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
    const fileType = f.type.includes('pdf') ? 'pdf' : 'image';
    await processInput(f.name, file_url, fileType);
  };

  const handleSave = async (data) => {
    await base44.entities.Transaction.create(data);

    if (data.payable_id) {
      await base44.entities.Payable.update(data.payable_id, { status: 'paid', transaction_id: null });
    }
    if (data.receivable_id) {
      await base44.entities.Receivable.update(data.receivable_id, { status: 'received', transaction_id: null });
    }

    queryClient.invalidateQueries();
    setPreview(null);
    setText('');
    toast.success('Lançamento salvo com sucesso!');
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-sora font-bold">Entrada via WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">Cole uma mensagem, faça upload de foto ou PDF de fatura</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Mensagem de texto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={"Cole aqui a mensagem do WhatsApp...\nEx: 'gastei 89 reais no mercado hoje' ou 'recebi 2500 da empresa X'"}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="resize-none bg-muted/30"
          />
          <Button onClick={handleText} disabled={!text.trim() || processing} className="w-full">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
            Processar com IA
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <label className="flex flex-col items-center gap-3 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                <Image className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Foto de Recibo</p>
                <p className="text-xs text-muted-foreground">JPG, PNG</p>
              </div>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={processing} />
            </label>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <label className="flex flex-col items-center gap-3 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">PDF de Fatura</p>
                <p className="text-xs text-muted-foreground">PDF</p>
              </div>
              <input type="file" accept=".pdf" onChange={handleFile} className="hidden" disabled={processing} />
            </label>
          </CardContent>
        </Card>
      </div>

      {processing && (
        <Card className="border-0 shadow-sm bg-accent/30">
          <CardContent className="p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">IA analisando o lançamento...</p>
            <p className="text-xs text-muted-foreground">Categorizando e verificando conciliações</p>
          </CardContent>
        </Card>
      )}

      {preview && (
        <TransactionPreviewModal
          data={preview}
          incomeSources={incomeSources}
          payables={payables}
          receivables={receivables}
          onSave={handleSave}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  );
}