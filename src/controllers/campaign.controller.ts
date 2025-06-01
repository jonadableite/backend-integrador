// src/controllers/campaign.controller.ts
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { campaignMessageQueue } from '../queue';
import AppLogger from '../utils/logger';

const prisma = new PrismaClient();
const campaignLogger = new AppLogger("CampaignController");

// Interface para o job da fila (deve corresponder ao tipo no worker.ts)
interface SendCampaignMessageJob {
  campaignId: string;
  recipientId: string; // Use recipientId para facilitar a busca no DB
  instanceId: string; // ID da instância a ser usada (será determinada aqui ou no worker)
  instanceName: string; // Nome da instância
  number: string;
  messageTextTemplate?: string | null;
  messageMediaTemplate?: any | null; // Use 'any' ou defina uma interface para o JSON
  messageButtons?: any | null; // Use 'any' ou defina uma interface para o JSON
  intervalMin: number;
  intervalMax: number;
  // Adicionar outros dados necessários para diferentes tipos de mensagem
}

export const createCampaign = async (req: Request, res: Response) => {
  const userId = (req as any).user.id; // Assumindo que o ID do usuário está no objeto request após autenticação
  const {
    name,
    messageTextTemplate,
    messageMediaTemplate,
    messageButtons,
    intervalMin,
    intervalMax,
    useNumberRotation,
    instanceIds,
    recipients: recipientNumbers // Array de strings com números
  } = req.body;

  try {
    // Validar dados de entrada (ex: verificar se instanceIds não está vazio se useNumberRotation for true)
    if (useNumberRotation && (!instanceIds || instanceIds.length === 0)) {
        return res.status(400).json({ error: "É necessário selecionar instâncias para rotação." });
    }

    // Criar a campanha no banco de dados
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name,
        status: 'draft', // Começa como rascunho
        messageTextTemplate,
        messageMediaTemplate,
        messageButtons,
        intervalMin: intervalMin || 5, // Valor padrão
        intervalMax: intervalMax || 15, // Valor padrão
        useNumberRotation: useNumberRotation ?? true, // Padrão true
        instanceIds: instanceIds || [],
        totalRecipients: recipientNumbers ? recipientNumbers.length : 0,
        // Recipients serão criados separadamente
      },
    });

    // Criar os destinatários associados à campanha
    if (recipientNumbers && recipientNumbers.length > 0) {
        const recipientsData = recipientNumbers.map((number: string) => ({
            campaignId: campaign.id,
            number,
            status: 'pending',
        }));
        await prisma.recipient.createMany({
            data: recipientsData,
            skipDuplicates: true, // Evita duplicados se houver na lista de entrada
        });
    }

    campaignLogger.info(`Campanha criada: ${campaign.id} por usuário ${userId}`);

    res.status(201).json(campaign);

  } catch (error: any) {
    campaignLogger.error('Erro ao criar campanha:', error);
    res.status(500).json({ error: 'Erro ao criar campanha', details: error.message });
  }
};

export const startCampaign = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { campaignId } = req.params;

    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            include: {
                recipients: {
                    where: {
                        status: 'pending' // Apenas destinatários pendentes
                    }
                },
                user: {
                    include: {
                        instances: { // Incluir instâncias do usuário para rotação
                            where: {
                                // @ts-ignore
                                id: {
                                    // @ts-ignore
                                    in: (await prisma.campaign.findUnique({ where: { id: campaignId } }))?.instanceIds // Apenas instâncias selecionadas na campanha
                                },
                                status: 'connected' // Apenas instâncias conectadas
                            }
                        }
                    }
                }
            },
        }) as (import('@prisma/client').Campaign & {
            recipients: Array<import('@prisma/client').Recipient>,
            user: import('@prisma/client').User & { instances: Array<any> }
        }) | null;

        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada.' });
        }

        if (campaign.userId !== userId) {
             return res.status(403).json({ error: 'Você não tem permissão para iniciar esta campanha.' });
        }

        if (campaign.status === 'running') {
             return res.status(400).json({ error: 'Campanha já está em execução.' });
        }

        if (campaign.recipients.length === 0) {
             return res.status(400).json({ error: 'Nenhum destinatário pendente para esta campanha.' });
        }

        const availableInstances = campaign.user.instances;

        if (campaign.useNumberRotation && availableInstances.length === 0) {
             return res.status(400).json({ error: 'Nenhuma instância conectada disponível para esta campanha.' });
        }

        // Atualizar status da campanha para running
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'running', startTime: new Date() },
        });

        let instanceIndex = 0; // Para rotação round-robin

        // Adicionar jobs para cada destinatário pendente
        for (const recipient of campaign.recipients) {
            let instanceToUse = null;

            if (campaign.useNumberRotation && availableInstances.length > 0) {
                 // Seleciona a próxima instância disponível em round-robin
                 instanceToUse = availableInstances[instanceIndex % availableInstances.length];
                 instanceIndex++; // Incrementa para a próxima iteração
            } else if (!campaign.useNumberRotation && availableInstances.length > 0) {
                 // Se não usar rotação, pega a primeira instância disponível (ou uma específica se a lógica for mais complexa)
                 instanceToUse = availableInstances[0];
            } else {
                 // Nenhuma instância disponível (isso já foi checado antes, mas é uma garantia)
                 campaignLogger.warn(`Nenhuma instância disponível para enviar mensagem para o destinatário ${recipient.id} na campanha ${campaignId}. Pulando job.`, undefined);
                 // Opcional: Marcar destinatário como falha ou pendente com motivo
                 await prisma.recipient.update({
                     where: { id: recipient.id },
                     data: { status: 'failed', failedReason: 'Nenhuma instância disponível' }
                 });
                 continue; // Pula para o próximo destinatário
            }


            const jobData: SendCampaignMessageJob = {
                campaignId: campaign.id,
                recipientId: recipient.id,
                instanceId: instanceToUse.id, // Passa o ID da instância
                instanceName: instanceToUse.name, // Passa o nome da instância
                number: recipient.number,
                messageTextTemplate: campaign.messageTextTemplate,
                messageMediaTemplate: campaign.messageMediaTemplate,
                messageButtons: campaign.messageButtons,
                intervalMin: campaign.intervalMin,
                intervalMax: campaign.intervalMax,
            };

            // Adicionar job à fila
            await campaignMessageQueue.add(
                `send-message-${campaign.id}-${recipient.id}`, // Nome único para o job
                jobData,
                {
                    // Opcional: Configurações específicas do job (ex: delay inicial)
                    // delay: Math.random() * (campaign.intervalMax - campaign.intervalMin) * 1000 + campaign.intervalMin * 1000, // Delay inicial antes do primeiro envio
                    attempts: 3, // Tentar 3 vezes em caso de falha
                    backoff: {
                        type: 'exponential',
                        delay: 1000, // Começa com 1 segundo de delay na retentativa
                    },
                }
            );

            // Opcional: Atualizar status do destinatário para 'queued'
             await prisma.recipient.update({
                 where: { id: recipient.id },
                 data: { status: 'queued' }
             });
        }

        campaignLogger.info(`Campanha ${campaignId} iniciada. ${campaign.recipients.length} jobs adicionados à fila.`);

        res.status(200).json({ message: 'Campanha iniciada e jobs adicionados à fila.', campaignId: campaign.id });

    } catch (error: any) {
        campaignLogger.error(`Erro ao iniciar campanha ${campaignId}:`, error);
        // Opcional: Reverter status da campanha se falhar ao adicionar jobs
        await prisma.campaign.update({
             where: { id: campaignId },
             data: { status: 'draft' }, // Ou 'failed_to_start'
        });
        res.status(500).json({ error: 'Erro ao iniciar campanha', details: error.message });
    }
};

// Adicione outras funções: pauseCampaign, cancelCampaign, getCampaignStatus, listCampaigns, uploadRecipients, etc.
