// src/worker.ts
import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import { setTimeout } from 'timers/promises'; // Para delays baseados em Promises
import { ConfigService } from './config/env.config';
import { EvolutionAPIService } from './services/sendMessage.service';
import { processSpintax } from './services/spintax.service';
import AppLogger from './utils/logger';

const configService = ConfigService.getInstance();
const evolutionApiService = new EvolutionAPIService();
const prisma = new PrismaClient(); // Instância do Prisma Client
const workerLogger = new AppLogger("CampaignWorker");

// Configuração da conexão com o Redis
const connection = {
  host: configService.redis.host,
  port: configService.redis.port,
  password: configService.redis.password,
};

// Tipos de Jobs que este worker pode processar (deve corresponder ao controller)
interface SendCampaignMessageJob {
  campaignId: string;
  recipientId: string;
  instanceId: string; // ID da instância selecionada pelo controller
  instanceName: string;
  number: string;
  messageTextTemplate?: string | null;
  messageMediaTemplate?: any | null;
  messageButtons?: any | null;
  intervalMin: number;
  intervalMax: number;
}

// Criação do Worker
const campaignWorker = new Worker<SendCampaignMessageJob>(
  'campaign-message-queue', // Nome da fila
  async (job) => {
    const {
      campaignId,
      recipientId,
      instanceId,
      instanceName,
      number,
      messageTextTemplate,
      messageMediaTemplate,
      messageButtons,
      intervalMin,
      intervalMax,
    } = job.data;
    const jobId = job.id;

    workerLogger.info(`Processando job ${jobId} para campanha ${campaignId}, destinatário ${recipientId}, instância ${instanceName}...`);

    // Buscar o destinatário para garantir que não foi cancelado/opt-out
    const recipient = await prisma.recipient.findUnique({
        where: { id: recipientId },
        include: { campaign: true } // Incluir campanha para acessar configurações
    });

    if (!recipient || recipient.status !== 'queued') {
        workerLogger.warn(`Job ${jobId} para destinatário ${recipientId} pulado. Status atual: ${recipient?.status || 'Não encontrado'}`);
        // Marcar job como completado sem erro se o destinatário não estiver mais pendente
        return;
    }

    // Gerar delay dinâmico antes de enviar a mensagem
    const delayMs = Math.random() * (intervalMax - intervalMin) * 1000 + intervalMin * 1000;
    workerLogger.debug(`Aplicando delay de ${delayMs.toFixed(0)}ms antes de enviar para ${number}...`);
    await setTimeout(delayMs);

    let sendResult: { success: boolean; messageId?: string; error?: string; details?: any };
    let messageContent = null; // Para armazenar o texto final enviado
    let messagePayload = null; // Para armazenar o payload completo enviado para a API

    try {
      // 1. Processar Spintax no template da mensagem de texto, se existir
      if (messageTextTemplate) {
        messageContent = processSpintax(messageTextTemplate);
      }

      // 2. Determinar o tipo de mensagem e chamar o serviço apropriado
      if (messageButtons) {
          // Enviar mensagem com botões
          // Adapte a estrutura do payload conforme a Evolution API espera para sendButtons
          messagePayload = {
              number,
              title: messageButtons.title || '', // Assumindo que o JSON de botões tem um title
              description: messageContent || messageButtons.description || '', // Usa texto processado ou descrição do JSON
              footer: messageButtons.footer || '', // Assumindo footer no JSON
              buttons: messageButtons.buttons, // Array de botões
              // Adicionar outras opções como quoted, delay (já tratado acima), etc.
          };
          sendResult = await evolutionApiService.sendButtons({
              instanceName,
              ...messagePayload,
          });

      } else if (messageMediaTemplate) {
          // Enviar mensagem com mídia
          // Adapte a estrutura do payload conforme a Evolution API espera para sendMedia
           messagePayload = {
               number,
               media: messageMediaTemplate.url, // Assumindo url no JSON
               caption: messageContent || messageMediaTemplate.caption || '', // Usa texto processado ou caption do JSON
               type: messageMediaTemplate.type, // Assumindo type (image, video, document, audio) no JSON
               // Adicionar outras opções como quoted, delay (já tratado acima), etc.
           };
          // NOTA: O sendMedia no seu EvolutionAPIService snippet não tem implementação.
          // Você precisará implementar o método sendMedia que aceita url/base64, caption, type, etc.
          // Por enquanto, vamos simular uma falha ou pular se sendMedia não estiver implementado.
          workerLogger.warn(`Tentativa de enviar mídia, mas o método sendMedia não está implementado ou configurado corretamente.`);
          sendResult = { success: false, error: "Envio de mídia não implementado no serviço." };

      } else if (messageTextTemplate) {
          // Enviar mensagem de texto simples (já processada com Spintax)
           messagePayload = {
               number,
               text: messageContent,
               // Adicionar outras opções como quoted, delay (já tratado acima), etc.
           };
          sendResult = await evolutionApiService.sendText({
              instanceName,
              ...messagePayload,
              text: messageContent ?? '', // Garante que text nunca será null
          });
      } else {
          // Nenhum template de mensagem fornecido
          workerLogger.warn(`Job ${jobId} para ${number}: Nenhum template de mensagem fornecido.`);
          sendResult = { success: false, error: "Nenhum template de mensagem fornecido." };
      }


      // 3. Lidar com o resultado do envio e atualizar o banco de dados
      if (sendResult.success) {
        workerLogger.info(`Job ${jobId} concluído: Mensagem enviada com sucesso para ${number}. MessageId: ${sendResult.messageId}`);

        // Atualizar status do destinatário para 'sent' e armazenar messageId
        await prisma.recipient.update({
          where: { id: recipientId },
          data: {
            status: 'sent',
            sentAt: new Date(),
            messageId: sendResult.messageId,
          },
        });

        // Criar log de envio
        await prisma.sendingLog.create({
            data: {
                campaignId: campaignId,
                recipientId: recipientId,
                instanceId: instanceId,
                status: 'success',
                messageContent: messageContent,
                messagePayload: messagePayload ?? undefined, // Armazena o payload enviado
                details: sendResult.details, // Armazena a resposta da API
            }
        });

        // Opcional: Atualizar contador de sentCount na campanha
        await prisma.campaign.update({
             where: { id: campaignId },
             data: { sentCount: { increment: 1 } }
        });


      } else {
        workerLogger.warn(`Job ${jobId} falhou no envio para ${number}: ${sendResult.error}. Detalhes: ${JSON.stringify(sendResult.details)}`);

        // Atualizar status do destinatário para 'failed' e registrar o motivo
        await prisma.recipient.update({
          where: { id: recipientId },
          data: {
            status: 'failed',
            failedReason: sendResult.error,
          },
        });

         // Criar log de envio com status de falha
        await prisma.sendingLog.create({
            data: {
                campaignId: campaignId,
                recipientId: recipientId,
                instanceId: instanceId,
                status: 'api_error', // Ou 'failed_attempt'
                messageContent: messageContent,
                messagePayload: messagePayload ?? undefined,
                details: sendResult.details,
            }
        });

        // Opcional: Atualizar contador de failedCount na campanha
         await prisma.campaign.update({
             where: { id: campaignId },
             data: { failedCount: { increment: 1 } }
         });

        // Dependendo da natureza da falha (ex: instância desconectada),
        // você pode querer marcar a instância como problemática ou notificar o usuário.
        // O BullMQ lida com retentativas automáticas para erros lançados.
        // Se a falha for permanente (ex: número inválido), talvez não queira retentar.
        // A lógica de retentativa pode ser ajustada nas opções do job (`attempts`, `backoff`).
        // Para falhas da API, é bom relançar o erro para que o BullMQ retente.
        if (sendResult.error !== "Nenhum template de mensagem fornecido." && sendResult.error !== "Envio de mídia não implementado no serviço.") {
             throw new Error(`Falha no envio da API: ${sendResult.error}`);
        }
      }

    } catch (error: any) {
      // 4. Lidar com erros inesperados durante o processamento do job
      workerLogger.error(`Exceção durante o processamento do job ${jobId} para ${number}:`, error);

      // Atualizar status do destinatário para falha se ainda estiver pendente/queued
      if (recipient && recipient.status === 'queued') {
           await prisma.recipient.update({
             where: { id: recipientId },
             data: {
               status: 'failed',
               failedReason: `Erro interno no worker: ${error.message}`,
             },
           });

           // Criar log de envio para a exceção
           await prisma.sendingLog.create({
               data: {
                   campaignId: campaignId,
                   recipientId: recipientId,
                   instanceId: instanceId,
                   status: 'worker_error',
                   messageContent: messageContent,
                   messagePayload: messagePayload ?? undefined,
                   details: { error: error.message, stack: error.stack },
               }
           });

            // Opcional: Atualizar contador de failedCount na campanha
            await prisma.campaign.update({
                where: { id: campaignId },
                data: { failedCount: { increment: 1 } }
            });
      }


      // Re-lançar o erro para que o BullMQ o registre como falha e gerencie retentativas
      throw error;
    }
  },
  {
    connection, // Conexão com o Redis
    // Outras opções do worker
    concurrency: 5, // Exemplo: Processar 5 jobs simultaneamente. Ajuste conforme a capacidade da API/instâncias.
    // maxRetriesPerJob: 3, // Já definido ao adicionar o job, mas pode ser definido aqui globalmente
  }
);

// Manipuladores de eventos do Worker (opcional, para logging e monitoramento)
campaignWorker.on('completed', (job) => {
  workerLogger.debug(`Job ${job.id} concluído.`);
});

campaignWorker.on('failed', (job, err) => {
  workerLogger.error(`Job ${job?.id} falhou com erro: ${err.message}`, err);
  // O status do destinatário já foi atualizado dentro do processador do job
});

campaignWorker.on('active', (job) => {
    workerLogger.debug(`Job ${job.id} está ativo.`);
});

campaignWorker.on('progress', (job, progress) => {
    workerLogger.debug(`Job ${job.id} progresso: ${progress}`);
});


workerLogger.info("Worker de campanhas iniciado, aguardando jobs...");

// Para manter o processo do worker rodando
process.on('SIGINT', () => campaignWorker.close().then(() => process.exit(0)));
process.on('SIGTERM', () => campaignWorker.close().then(() => process.exit(0)));

// Exporte o worker se precisar gerenciá-lo externamente,
// mas geralmente o worker é um processo que você inicia separadamente.
// export default campaignWorker;
