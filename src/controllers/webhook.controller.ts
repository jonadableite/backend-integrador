// src/controllers/webhook.controller.ts
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import AppLogger from '../utils/logger';

const prisma = new PrismaClient();
const webhookLogger = new AppLogger('WebhookController');

export const webhookController = {
    /**
     * Handler para receber webhooks da Evolution API.
     * @param req Request object
     * @param res Response object
     */
    handleWebhook: async (req: Request, res: Response) => {
        const payload = req.body;
        const event = payload.event;
        const instanceName = payload.instanceName;
        const data = payload.data; // Contém os dados específicos do evento

        if (!event || !instanceName || !data) {
            webhookLogger.warn('Webhook recebido com payload inválido (falta event, instanceName ou data).', { payload });
            return res.status(400).send('Payload inválido');
        }

        webhookLogger.webhook(`Webhook recebido: Evento=${event}, Instância=${instanceName}`, { payload });

        // --- Tratamento de eventos de Mensagem (Envios) ---
        // MESSAGES_UPSERT: Nova mensagem (incluindo as que enviamos)
        // MESSAGES_UPDATE: Atualização de status de mensagem (enviada, entregue, lida)
        if (event === 'MESSAGES_UPSERT' || event === 'MESSAGES_UPDATE') {
            // O payload para estes eventos geralmente é um array, mesmo que com um item
            const messages = Array.isArray(data) ? data : [data];

            for (const message of messages) {
                // Verificamos se é uma mensagem que enviamos e se tem status de ACK (acknowledgement)
                // ou se o status da mensagem mudou (ex: de sending para sent/delivered/read)
                const isSentMessage = message.key && message.key.fromMe;
                const hasStatusUpdate = message.status || message.ack !== undefined; // ack indica o status de entrega/leitura

                if (isSentMessage && hasStatusUpdate) {
                    const messageId = message.key.id;
                    const remoteJid = message.key.remoteJid; // Número do destinatário
                    const newStatus = message.status || (message.ack !== undefined ? `ack_${message.ack}` : 'unknown'); // Usa status ou ack

                    if (!messageId) {
                        webhookLogger.warn(`Mensagem enviada sem messageId no webhook ${event}. Pulando.`, { message, instanceName });
                        continue; // Pula para a próxima mensagem se não houver messageId
                    }

                    try {
                        // Tenta encontrar o SendingLog associado a este messageId
                        const sendingLog = await prisma.sendingLog.findUnique({
                            where: {
                              id: messageId, // Use 'id' que é o campo único
                            },
                            include: {
                              recipient: true, // Inclui os dados do Recipient relacionado
                              instance: true,  // Inclui os dados da Instance relacionada
                            },
                          });

                        if (sendingLog) {
                            // Atualiza o status no SendingLog
                            await prisma.sendingLog.update({
                                where: { id: sendingLog.id },
                                data: { status: newStatus },
                            });

                            // Se o status indica sucesso (enviada, entregue, lida), atualiza o Recipient
                            // Adapte os status conforme a sua necessidade e os valores do 'ack' da Evolution API
                            // ack: -1=ERROR, 0=CLOCK, 1=SENT, 2=DELIVERED, 3=READ, 4=PLAYED
                            const successStatuses = ['sent', 'delivered', 'read', 'ack_1', 'ack_2', 'ack_3', 'ack_4']; // Exemplo de status de sucesso
                            const failedStatuses = ['failed', 'error', 'ack_-1']; // Exemplo de status de falha

                            if (sendingLog.recipient && successStatuses.includes(newStatus)) {
                                // Atualiza o status do Recipient apenas se ainda não for 'sent', 'delivered' ou 'read'
                                // Isso evita sobrescrever um status mais "avançado" com um menos (ex: delivered com sent)
                                const currentRecipientStatus = sendingLog.recipient.status;
                                let updateRecipient = false;
                                let newRecipientStatus = currentRecipientStatus;

                                if (newStatus === 'ack_1' && currentRecipientStatus === 'sending') {
                                    updateRecipient = true;
                                    newRecipientStatus = 'sent';
                                } else if (newStatus === 'ack_2' && (currentRecipientStatus === 'sending' || currentRecipientStatus === 'sent')) {
                                    updateRecipient = true;
                                    newRecipientStatus = 'delivered';
                                } else if ((newStatus === 'ack_3' || newStatus === 'ack_4') && (currentRecipientStatus === 'sending' || currentRecipientStatus === 'sent' || currentRecipientStatus === 'delivered')) {
                                    updateRecipient = true;
                                    newRecipientStatus = 'read';
                                }
                                // Adicione outras condições se usar os status 'sent', 'delivered', 'read' diretamente do message.status

                                if (updateRecipient) {
                                    await prisma.recipient.update({
                                        where: { id: sendingLog.recipient.id },
                                        data: { status: newRecipientStatus },
                                    });
                                    webhookLogger.info(
                                        `Status do Recipient ${sendingLog.recipient.id} (${sendingLog.recipient.number}) atualizado para '${newRecipientStatus}' na Campaign ${sendingLog.recipient.campaignId}.`,
                                        {
                                            recipientId: sendingLog.recipient.id,
                                            campaignId: sendingLog.recipient.campaignId,
                                            oldStatus: currentRecipientStatus,
                                            newStatus: newRecipientStatus,
                                            messageId: messageId,
                                            instanceId: sendingLog.instance?.id || 'N/A', // Obtém instanceId do SendingLog
                                            instanceName: instanceName,
                                        }
                                    );
                                }

                            } else if (sendingLog.recipient && failedStatuses.includes(newStatus)) {
                                // Opcional: Marcar o Recipient como falha se o envio falhar
                                // Depende da sua lógica de retentativa/tratamento de falhas
                                if (sendingLog.recipient.status !== 'failed' && sendingLog.recipient.status !== 'opted-out') {
                                     await prisma.recipient.update({
                                        where: { id: sendingLog.recipient.id },
                                        data: { status: 'failed' },
                                    });
                                     webhookLogger.warn(
                                        `Envio para Recipient ${sendingLog.recipient.id} (${sendingLog.recipient.number}) falhou com status '${newStatus}' na Campaign ${sendingLog.recipient.campaignId}.`,
                                        {
                                            recipientId: sendingLog.recipient.id,
                                            campaignId: sendingLog.recipient.campaignId,
                                            status: newStatus,
                                            messageId: messageId,
                                            instanceId: sendingLog.instance?.id || 'N/A', // Obtém instanceId do SendingLog
                                            instanceName: instanceName,
                                        }
                                    );
                                }
                            }


                            webhookLogger.info(
                                `Status do SendingLog ${sendingLog.id} (MessageId: ${messageId}) atualizado para '${newStatus}'.`,
                                {
                                    sendingLogId: sendingLog.id,
                                    messageId: messageId,
                                    oldStatus: sendingLog.status,
                                    newStatus: newStatus,
                                    recipientId: sendingLog.recipient?.id || 'N/A',
                                    campaignId: sendingLog.recipient?.campaignId || 'N/A',
                                    instanceId: sendingLog.instance?.id || 'N/A', // Obtém instanceId do SendingLog
                                    instanceName: instanceName,
                                }
                            );

                        } else {
                            // Isso pode acontecer para mensagens recebidas ou mensagens enviadas que não foram registradas
                            // no SendingLog (ex: mensagens manuais, mensagens de grupos, etc.)
                            // Você pode logar isso como info ou debug, dependendo da verbosidade desejada
                             webhookLogger.debug(`Webhook ${event} para messageId ${messageId} não encontrado no SendingLog.`, { messageId, instanceName, remoteJid, isSentMessage });
                        }

                    } catch (error) {
                        webhookLogger.error(`Erro ao processar webhook ${event} para messageId ${messageId}:`, error);
                    }
                } else {
                    // Loga outras mensagens (recebidas, sem status update, etc.) se necessário para depuração
                    // webhookLogger.debug(`Webhook ${event} recebido (não é mensagem enviada com status update):`, { message, instanceName });
                }
            }
        }

        // --- Tratamento de Opt-out (Exemplo usando INTERACTIVE_RESPONSE) ---
        // Adapte esta lógica conforme a forma como você implementa o opt-out
        // usando botões interativos ou respostas de texto.
        if (event === 'INTERACTIVE_RESPONSE') {
             const buttonResponseMessage = data; // O payload pode variar, ajuste conforme a Evolution API
             const buttonId = buttonResponseMessage?.interactiveResponseMessage?.buttonId;
             const remoteJid = buttonResponseMessage?.key?.remoteJid; // Quem clicou no botão
             const messageIdOfClickedButton = buttonResponseMessage?.key?.id; // ID da mensagem original com o botão

             if (!buttonId || !remoteJid) {
                 webhookLogger.warn(
                     `Webhook INTERACTIVE_RESPONSE recebido sem buttonId ou remoteJid.`,
                     { payload: buttonResponseMessage, instanceName }
                 );
                 return res.status(200).send('OK');
             }

             // --- Lógica para extrair recipientId e campaignId do buttonId ---
             // ESTA PARTE PRECISA SER ADAPTADA À SUA IMPLEMENTAÇÃO.
             // Exemplo: Se o buttonId for no formato "optout_recipientId_campaignId"
             const optOutPrefix = 'optout_';
             if (!buttonId.startsWith(optOutPrefix)) {
                 // Não é um botão de opt-out que esperamos
                 webhookLogger.info(
                     `Webhook INTERACTIVE_RESPONSE recebido com buttonId '${buttonId}', mas não é um botão de opt-out esperado.`,
                     { buttonId, remoteJid, instanceName }
                 );
                 return res.status(200).send('OK');
             }

             const parts = buttonId.substring(optOutPrefix.length).split('_');
             if (parts.length !== 2) {
                 webhookLogger.warn(
                     `Webhook INTERACTIVE_RESPONSE (opt-out) recebido com buttonId '${buttonId}' em formato inesperado.`,
                     { buttonId, remoteJid, instanceName }
                 );
                 return res.status(200).send('OK');
             }

             const clickedRecipientId = parts[0];
             const clickedCampaignId = parts[1];
             // --- Fim da Lógica de Extração (Adaptar aqui) ---

             if (!clickedRecipientId || !clickedCampaignId) {
                 // Isso não deve acontecer se a lógica de extração estiver correta, mas é uma segurança
                 webhookLogger.warn(
                     `Webhook INTERACTIVE_RESPONSE (opt-out) recebido, mas não foi possível extrair recipientId ou campaignId do buttonId: ${buttonId}.`,
                     {
                         buttonId: buttonId,
                         messageId: messageIdOfClickedButton,
                         remoteJid: remoteJid,
                         instanceName: instanceName,
                         payload: buttonResponseMessage // Inclui o payload completo para depuração
                     }
                  );
                  return res.status(200).send('OK');
             }

             try {
                 // Encontra o recipient e verifica se já não optou-out
                 const clickedRecipient = await prisma.recipient.findUnique({
                     where: { id: clickedRecipientId, campaignId: clickedCampaignId },
                     include: { campaign: true },
                 });

                 if (clickedRecipient && clickedRecipient.status !== 'opted-out') {
                     // Atualiza o status do recipient para opted-out
                     await prisma.recipient.update({
                         where: { id: clickedRecipient.id },
                         data: {
                             status: 'opted-out',
                             // Você pode querer registrar a data/hora do opt-out
                             // optedOutAt: new Date(), // Adicione este campo ao modelo Recipient se necessário
                         },
                     });

                     // Incrementa o contador de opt-out na campanha
                     await prisma.campaign.update({
                         where: { id: clickedCampaignId },
                         data: {
                             optedOutCount: { increment: 1 },
                         },
                     });

                     // Tenta encontrar o SendingLog para obter a instanceId, se o messageId estiver disponível
                     let instanceIdForLog = 'N/A';
                     if (messageIdOfClickedButton) {
                         const sendingLogForButton = await prisma.sendingLog.findFirst({
                             where: { id: messageIdOfClickedButton },
                             include: { instance: true }
                         });
                         if (sendingLogForButton && sendingLogForButton.instance) {
                             instanceIdForLog = sendingLogForButton.instance.id;
                         }
                     } else {
                          // Se messageId não estiver disponível, loga sem a instanceId específica da mensagem
                          webhookLogger.warn(
                             `Webhook INTERACTIVE_RESPONSE (opt-out) para Recipient ${clickedRecipientId} na Campaign ${clickedCampaignId} recebido, mas messageId não disponível no payload para encontrar a instanceId.`,
                             { // Objeto de detalhes para o logger
                                 recipientId: clickedRecipientId,
                                 campaignId: clickedCampaignId,
                                 buttonId: buttonId,
                                 remoteJid: remoteJid,
                                 instanceName: instanceName,
                                 // payload: buttonResponseMessage // Opcional: Incluir payload completo
                             }
                          );
                     }

                     webhookLogger.info(
                         `Recipient ${clickedRecipientId} (${clickedRecipient.number}) optou-out da Campaign ${clickedCampaignId}.`,
                         { // Objeto de detalhes para o logger
                             recipientId: clickedRecipientId,
                             campaignId: clickedCampaignId,
                             messageId: messageIdOfClickedButton || 'N/A',
                             instanceId: instanceIdForLog, // Usa a instanceId encontrada (ou 'N/A')
                             remoteJid: remoteJid,
                             instanceName: instanceName,
                             buttonId: buttonId,
                         }
                     );

                 } else {
                     // Loga se o recipient não foi encontrado ou já optou-out
                     webhookLogger.info( // Alterado para info, pois não é necessariamente um erro, apenas um clique duplicado ou inválido
                         `Clique de opt-out para Recipient ${clickedRecipientId} na Campaign ${clickedCampaignId} não encontrado ou já opted-out.`,
                         { // Objeto de detalhes para o logger
                             recipientId: clickedRecipientId,
                             campaignId: clickedCampaignId,
                             messageId: messageIdOfClickedButton || 'N/A',
                             remoteJid: remoteJid,
                             instanceName: instanceName,
                             buttonId: buttonId,
                             // payload: buttonResponseMessage // Opcional: Incluir payload completo
                         }
                     );
                 }

             } catch (error) {
                 // Loga qualquer erro que ocorra durante o processamento do opt-out
                 webhookLogger.error(`Erro ao processar opt-out para Recipient ${clickedRecipientId} na Campaign ${clickedCampaignId}:`, error);
             }

             return res.status(200).send('OK');
        }


        // --- Tratamento de eventos de Conexão ---
        if (event === 'CONNECTION_UPDATE') {
            const connectionData = data; // Adapte conforme a estrutura do payload
            const state = connectionData?.state; // Ex: 'connecting', 'connected', 'disconnected'
            const qrCode = connectionData?.qrcode; // QR Code se disponível
            const status = connectionData?.status; // Status mais detalhado

            if (!instanceName) {
                webhookLogger.warn('Webhook CONNECTION_UPDATE sem instanceName. Pulando.');
                return res.status(200).send('OK');
            }

            try {
                // Encontra a instância pelo nome
                const instance = await prisma.instance.findUnique({
                    where: { name: instanceName },
                });

                if (instance) {
                    // Atualiza o status da instância no banco de dados
                    await prisma.instance.update({
                        where: { id: instance.id },
                        data: {
                            status: state || 'unknown', // Use o estado principal
                            // Você pode querer salvar mais detalhes do estado de conexão
                            // connectionDetails: connectionData, // Adicione este campo ao modelo Instance se necessário
                        },
                    });

                     webhookLogger.info(
                         `Webhook CONNECTION_UPDATE para instância ${instanceName}. Estado: ${state}, Status: ${status}.`,
                         { // Objeto de detalhes para o logger
                             instanceId: instance.id, // Inclui o ID da instância do DB
                             instanceName: instanceName,
                             state: state,
                             status: status,
                             hasQrCode: !!qrCode, // Indica se veio QR Code
                             // Adicionar outros dados relevantes do payload
                         }
                     );
                } else {
                     webhookLogger.warn(
                         `Webhook CONNECTION_UPDATE para instância ${instanceName} recebido, mas instância não encontrada no banco de dados.`,
                         { instanceName, state, status }
                     );
                }


            } catch (error) {
                 webhookLogger.error(`Erro ao processar webhook CONNECTION_UPDATE para instância ${instanceName}:`, error);
            }


            return res.status(200).send('OK');
        }


        // --- Outros eventos ---
        // Adicione handlers para outros eventos que você precisa processar (ex: QRCODE_UPDATED, CALL, etc.)
        // Exemplo para QRCODE_UPDATED:
        if (event === 'QRCODE_UPDATED') {
             const qrcodeData = data;
             const qrCode = qrcodeData?.qrcode; // O QR Code em base64 ou URL
             const base64 = qrcodeData?.base64; // Flag indicando se é base64
             const attempts = qrcodeData?.attempts; // Tentativas restantes

             if (!instanceName || !qrCode) {
                 webhookLogger.warn('Webhook QRCODE_UPDATED sem instanceName ou qrcode. Pulando.', { payload: qrcodeData, instanceName });
                 return res.status(200).send('OK');
             }

             try {
                 // Encontra a instância pelo nome
                 const instance = await prisma.instance.findUnique({
                     where: { name: instanceName },
                 });

                 if (instance) {
                     // Atualiza o QR Code e status da instância
                     await prisma.instance.update({
                         where: { id: instance.id },
                         data: {

                             status: 'qrcode',
                         },
                     });

                      webhookLogger.info(
                          `Webhook QRCODE_UPDATED para instância ${instanceName}. Novo QR Code disponível. Tentativas restantes: ${attempts}.`,
                          {
                              instanceId: instance.id,
                              instanceName: instanceName,
                              hasQrCode: !!qrCode,
                              attempts: attempts,
                          }
                      );
                 } else {
                      webhookLogger.warn(
                          `Webhook QRCODE_UPDATED para instância ${instanceName} recebido, mas instância não encontrada no banco de dados.`,
                          { instanceName, hasQrCode: !!qrCode, attempts }
                      );
                 }

             } catch (error) {
                 webhookLogger.error(`Erro ao processar webhook QRCODE_UPDATED para instância ${instanceName}:`, error);
             }

             return res.status(200).send('OK');
        }


        // Loga eventos não tratados, se necessário para monitoramento
        // webhookLogger.debug(`Webhook de evento não tratado recebido: ${event}`, { payload, instanceName });


        // Sempre retorne 200 OK para a Evolution API para indicar que o webhook foi recebido
        // Mesmo que você não processe o evento específico.
        res.status(200).send('OK');
    },
};
