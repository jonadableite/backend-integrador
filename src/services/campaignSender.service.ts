// src/services/campaignSender.service.ts
import {
	type Campaign,
	type Instance,
	PrismaClient,
	type Recipient,
	type SendingLog,
} from "@prisma/client";
import type {
	Button,
	Metadata,
	SendButtonsDto,
	SendTextDto,
	TypeButton,
} from "../types/evolutionApi.types";
import { Logger } from "../utils/logger";
import { processSpintax } from "../utils/spintax";
import { evolutionApiService } from "./evolutionApi.service";

const logger = new Logger("CampaignSenderService");
const prisma = new PrismaClient();

// Interface para unificar os tipos de payload de mensagem que podem ser enviados
type MessagePayload = SendTextDto | SendButtonsDto; // Adicione outros tipos (SendMediaDto, etc.) conforme implementar

class CampaignSenderService {
	/**
	 * Encontra a próxima campanha pendente ou em execução para processar.
	 * @returns A campanha a ser processada ou null.
	 */
	async findNextCampaignToProcess(): Promise<Campaign | null> {
		logger.info("Buscando próxima campanha para processar...");
		// Busca campanhas com status 'pending' ou 'running' que tenham um startTime no passado ou nulo
		const campaign = await prisma.campaign.findFirst({
			where: {
				status: {
					in: ["pending", "running"],
				},
				OR: [{ startTime: null }, { startTime: { lte: new Date() } }],
			},
			include: {
				instances: true, // Inclui as instâncias relacionadas
			},
			orderBy: {
				createdAt: "asc", // Processa as mais antigas primeiro
			},
		});

		if (campaign) {
			logger.info(
				`Campanha encontrada para processar: ${campaign.name} (ID: ${campaign.id})`,
			);
			// Atualiza o status para 'running' se ainda estiver 'pending'
			if (campaign.status === "pending") {
				await prisma.campaign.update({
					where: { id: campaign.id },
					data: { status: "running" },
				});
				logger.info(
					`Status da campanha ${campaign.id} atualizado para 'running'.`,
				);
			}
		} else {
			logger.debug("Nenhuma campanha pendente ou em execução encontrada.");
		}

		return campaign;
	}

	/**
	 * Encontra o próximo destinatário pendente para uma campanha.
	 * @param campaignId ID da campanha.
	 * @returns O destinatário a ser enviado ou null.
	 */
	async findNextRecipientToSend(campaignId: string): Promise<Recipient | null> {
		logger.debug(
			`Buscando próximo destinatário pendente para a campanha ${campaignId}...`,
		);
		const recipient = await prisma.recipient.findFirst({
			where: {
				campaignId: campaignId,
				status: "pending",
			},
			orderBy: {
				createdAt: "asc", // Envia para os mais antigos primeiro
			},
		});

		if (recipient) {
			logger.debug(
				`Destinatário encontrado: ${recipient.number} (ID: ${recipient.id}) para a campanha ${campaignId}.`,
			);
		} else {
			logger.debug(
				`Nenhum destinatário pendente encontrado para a campanha ${campaignId}.`,
			);
		}

		return recipient;
	}

	/**
	 * Seleciona uma instância disponível para envio, aplicando a rotação se configurada.
	 * @param campaign A campanha atual.
	 * @returns Uma instância disponível ou null.
	 */
	async selectSendingInstance(
		campaign: Campaign & { instances: Instance[] },
	): Promise<Instance | null> {
		logger.debug(
			`Selecionando instância para a campanha ${campaign.id}. Rotação ativada: ${campaign.useNumberRotation}`,
		);

		const availableInstances = campaign.instances.filter(
			(inst) => inst.status === "connected",
		);

		if (availableInstances.length === 0) {
			logger.warn(
				`Nenhuma instância 'connected' disponível para a campanha ${campaign.id}.`,
			);
			return null;
		}

		if (!campaign.useNumberRotation) {
			// Se rotação desativada, pega a primeira instância conectada disponível
			const selected = availableInstances[0];
			logger.debug(
				`Rotação desativada. Selecionada a primeira instância conectada: ${selected.name} (ID: ${selected.id}).`,
			);
			return selected;
		}

		// Lógica de rotação (Round Robin simples baseada no lastUsedAt)
		// Encontra a instância conectada que foi usada há mais tempo
		const sortedInstances = availableInstances.sort((a, b) => {
			const timeA = a.lastUsedAt?.getTime() || 0; // Considera 0 se nunca foi usado
			const timeB = b.lastUsedAt?.getTime() || 0;
			return timeA - timeB;
		});

		const selected = sortedInstances[0];
		logger.debug(
			`Rotação ativada. Selecionada a instância menos usada: ${selected.name} (ID: ${selected.id}).`,
		);

		// Atualiza o lastUsedAt para a instância selecionada (async, não precisa esperar)
		prisma.instance
			.update({
				where: { id: selected.id },
				data: { lastUsedAt: new Date() },
			})
			.catch((err) => {
				logger.error(
					`Erro ao atualizar lastUsedAt para a instância ${selected.id}:`,
					err,
				);
			});

		return selected;
	}

	/**
	 * Gera o payload da mensagem para a Evolution API, incluindo Spintax e botões.
	 * @param campaign A campanha atual.
	 * @param recipient O destinatário.
	 * @returns O payload da mensagem ou null se não houver conteúdo.
	 */
	generateMessagePayload(
		campaign: Campaign,
		recipient: Recipient,
	): MessagePayload | null {
		logger.debug(
			`Gerando payload da mensagem para o destinatário ${recipient.id} da campanha ${campaign.id}.`,
		);

		// Processa o texto com Spintax
		const processedText = processSpintax(campaign.messageTextTemplate);

		// Prepara a estrutura básica do payload
		const basePayload: Metadata = {
			number: recipient.number,
			delay:
				Math.floor(
					Math.random() * (campaign.intervalMax - campaign.intervalMin + 1),
				) + campaign.intervalMin, // Intervalo dinâmico
			// Outras opções Metadata podem ser adicionadas aqui, se necessário
		};

		// Adiciona botões se existirem na configuração da campanha
		let buttons: Button[] = [];
		if (campaign.messageButtons && Array.isArray(campaign.messageButtons)) {
			buttons = campaign.messageButtons as Button[]; // Assume que é um array de Button
		}

		// Adiciona o botão de "Não desejo mais receber" se não existir
		const optOutButtonText = "Não desejo mais receber";
		const hasOptOutButton = buttons.some(
			(button) =>
				button.type === "reply" && button.displayText === optOutButtonText,
		);

		if (!hasOptOutButton) {
			// Adiciona o botão de opt-out como um botão de resposta rápida (reply)
			// O 'id' pode ser um identificador único para você processar no webhook de resposta
			buttons.push({
				type: "reply" as TypeButton,
				displayText: optOutButtonText,
				id: `opt-out-${campaign.id}-${recipient.id}`, // ID único para rastreamento
			});
			logger.debug(`Botão de opt-out adicionado ao payload.`);
		}

		// Decide o tipo de mensagem a enviar (texto, botões, mídia, etc.)
		// Por enquanto, focamos em texto e botões. Se houver botões, enviamos como mensagem de botão.
		// Se houver mídia configurada, você precisará adaptar esta lógica.
		if (buttons.length > 0) {
			// Se há botões, a mensagem principal geralmente vai no campo 'description' ou similar, dependendo do tipo de botão (reply vs call/url)
			// A Evolution API usa `SendButtonsDto` para botões de resposta rápida.
			// O texto principal vai no campo `description`.
			if (!processedText && !campaign.messageMediaTemplate) {
				logger.warn(
					`Campanha ${campaign.id} configurada com botões, mas sem texto ou mídia. Ignorando destinatário ${recipient.id}.`,
				);
				return null; // Não há conteúdo para enviar
			}

			const buttonPayload: SendButtonsDto = {
				...basePayload,
				title: campaign.name, // Usando o nome da campanha como título (pode ser adaptado)
				description:
					processedText ||
					(campaign.messageMediaTemplate as any)?.caption ||
					"Mensagem", // Usa texto processado ou caption da mídia
				footer: "Powered by WhatLead", // Exemplo de rodapé
				buttons: buttons,
				// thumbnailUrl: campaign.messageMediaTemplate ? (campaign.messageMediaTemplate as any).url : undefined, // Se tiver mídia com thumbnail
			};
			logger.debug(`Payload de botão gerado para ${recipient.number}.`);
			return buttonPayload;
		} else if (processedText) {
			// Se não há botões, envia como mensagem de texto simples (se houver texto)
			const textPayload: SendTextDto = {
				...basePayload,
				text: processedText,
			};
			logger.debug(`Payload de texto gerado para ${recipient.number}.`);
			return textPayload;
		} else if (campaign.messageMediaTemplate) {
			// Se houver mídia configurada (você precisará implementar o SendMediaDto)
			// Exemplo (requer implementação completa do SendMediaDto e lógica de mídia):
			// const mediaPayload: SendMediaDto = {
			//     ...basePayload,
			//     ...(campaign.messageMediaTemplate as any), // Assumindo que messageMediaTemplate tem a estrutura correta
			//     caption: processSpintax((campaign.messageMediaTemplate as any).caption), // Processa Spintax na legenda da mídia
			// };
			// logger.debug(`Payload de mídia gerado para ${recipient.number}.`);
			// return mediaPayload;
			logger.warn(
				`Campanha ${campaign.id} configurada com mídia, mas a lógica de envio de mídia não está totalmente implementada.`,
			);
			return null; // Implementar envio de mídia
		}

		logger.warn(
			`Campanha ${campaign.id} sem texto, mídia ou botões configurados. Ignorando destinatário ${recipient.id}.`,
		);
		return null; // Nenhuma mensagem para enviar
	}

	/**
	 * Envia a mensagem para um destinatário específico usando a instância selecionada.
	 * @param campaign A campanha atual.
	 * @param recipient O destinatário.
	 * @param instance A instância a ser usada para o envio.
	 * @returns O resultado da chamada da API.
	 */
	async sendMessageToRecipient(
		campaign: Campaign,
		recipient: Recipient,
		instance: Instance,
	): Promise<any> {
		logger.info(
			`Iniciando envio para ${recipient.number} (Campanha: ${campaign.id}, Instância: ${instance.name}).`,
		);

		const messagePayload = this.generateMessagePayload(campaign, recipient);

		if (!messagePayload) {
			logger.warn(
				`Nenhum payload gerado para o destinatário ${recipient.number}. Marcando como falha.`,
			);
			await this.updateRecipientStatus(
				recipient.id,
				"failed",
				"Nenhum conteúdo de mensagem gerado.",
			);
			await this.createSendingLog(
				campaign.id,
				recipient.id,
				instance.id,
				"api_error",
				"Nenhum conteúdo de mensagem gerado.",
				{},
			);
			return null;
		}

		try {
			let apiResponse: any;
			// Decide qual método da Evolution API chamar baseado no tipo de payload
			if ("buttons" in messagePayload) {
				apiResponse = await evolutionApiService.sendButtons(
					instance.name,
					messagePayload as SendButtonsDto,
				);
			} else if ("text" in messagePayload) {
				apiResponse = await evolutionApiService.sendText(
					instance.name,
					messagePayload as SendTextDto,
				);
			}
			// Adicione outras verificações de tipo de payload aqui (ex: 'mediatype' in messagePayload para mídia)

			logger.info(
				`Envio para ${recipient.number} via ${instance.name} aparentemente bem-sucedido. API Response:`,
				apiResponse,
			);

			// Atualiza o status do destinatário para 'sent' e armazena o messageId da API
			await this.updateRecipientStatus(
				recipient.id,
				"sent",
				null,
				apiResponse?.messageId,
			);

			// Cria um log de envio
			await this.createSendingLog(
				campaign.id,
				recipient.id,
				instance.id,
				"attempted", // Ou 'api_success' se preferir
				"Mensagem enviada para a API Evolution.",
				apiResponse,
			);

			// Incrementa o contador de enviados na campanha (async)
			prisma.campaign
				.update({
					where: { id: campaign.id },
					data: { sentCount: { increment: 1 } },
				})
				.catch((err) => {
					logger.error(
						`Erro ao incrementar sentCount para a campanha ${campaign.id}:`,
						err,
					);
				});

			return apiResponse;
		} catch (error: any) {
			logger.error(
				`Falha no envio para ${recipient.number} via ${instance.name}:`,
				error,
			);

			// Atualiza o status do destinatário para 'failed'
			await this.updateRecipientStatus(
				recipient.id,
				"failed",
				error.message || "Erro desconhecido na API.",
			);

			// Cria um log de envio com status de erro
			await this.createSendingLog(
				campaign.id,
				recipient.id,
				instance.id,
				"api_error",
				error.message || "Erro desconhecido na API.",
				{ error: error.message, response: error.response?.data }, // Inclui detalhes do erro da API, se disponíveis
			);

			// Incrementa o contador de falhas na campanha (async)
			prisma.campaign
				.update({
					where: { id: campaign.id },
					data: { failedCount: { increment: 1 } },
				})
				.catch((err) => {
					logger.error(
						`Erro ao incrementar failedCount para a campanha ${campaign.id}:`,
						err,
					);
				});

			// Decide se deve tentar com outra instância ou parar para este destinatário
			// Por enquanto, apenas registra a falha. Uma lógica de retry pode ser adicionada aqui.
			throw error; // Relança o erro para ser tratado pelo orquestrador, se necessário
		}
	}

	/**
	 * Atualiza o status de um destinatário.
	 * @param recipientId ID do destinatário.
	 * @param status Novo status.
	 * @param failedReason Razão da falha (se status for 'failed').
	 * @param messageId ID da mensagem retornado pela API (se status for 'sent').
	 */
	async updateRecipientStatus(
		recipientId: string,
		status: Recipient["status"],
		failedReason: string | null = null,
		messageId: string | null = null,
	): Promise<Recipient> {
		logger.debug(
			`Atualizando status do destinatário ${recipientId} para '${status}'.`,
		);
		const updateData: any = { status: status };
		if (status === "sent") {
			updateData.sentAt = new Date();
			if (messageId) updateData.messageId = messageId;
		} else if (status === "failed") {
			updateData.failedReason = failedReason;
		}
		// Adicionar lógica para 'delivered', 'read', 'replied', 'opted-out' baseada em webhooks

		const updatedRecipient = await prisma.recipient.update({
			where: { id: recipientId },
			data: updateData,
		});
		logger.info(
			`Status do destinatário ${recipientId} atualizado para '${status}'.`,
		);
		return updatedRecipient;
	}

	/**
	 * Cria um registro de log de envio.
	 * @param campaignId ID da campanha.
	 * @param recipientId ID do destinatário.
	 * @param instanceId ID da instância usada.
	 * @param status Status do log.
	 * @param detailsJson Detalhes adicionais em formato JSON.
	 */
	async createSendingLog(
		campaignId: string,
		recipientId: string,
		instanceId: string,
		status: SendingLog["status"],
		messageContent: string | null,
		detailsJson: any,
	): Promise<SendingLog> {
		logger.debug(
			`Criando log de envio para Recipient ${recipientId}, Instance ${instanceId}, Status '${status}'.`,
		);
		const log = await prisma.sendingLog.create({
			data: {
				campaignId: campaignId,
				recipientId: recipientId,
				instanceId: instanceId,
				status: status,
				messageContent: messageContent,
				details: detailsJson, // Prisma mapeia `any` para JsonValue
			},
		});
		logger.debug(`Log de envio criado com ID: ${log.id}.`);
		return log;
	}

	/**
	 * Orquestra o processo de envio de uma campanha.
	 * Este método deve ser chamado periodicamente por um worker ou scheduler.
	 * @param campaignId Opcional: Processa uma campanha específica. Se nulo, busca a próxima.
	 */
	async processCampaign(campaignId?: string): Promise<void> {
		let campaign: (Campaign & { instances: Instance[] }) | null = null;

		if (campaignId) {
			logger.info(`Processando campanha específica: ${campaignId}`);
			campaign = await prisma.campaign.findUnique({
				where: { id: campaignId },
				include: { instances: true },
			});
			if (!campaign) {
				logger.warn(`Campanha com ID ${campaignId} não encontrada.`);
				return;
			}
			// Atualiza o status para 'running' se ainda estiver 'pending'
			if (campaign.status === "pending") {
				await prisma.campaign.update({
					where: { id: campaign.id },
					data: { status: "running" },
				});
				campaign.status = "running"; // Atualiza o objeto local também
				logger.info(
					`Status da campanha ${campaign.id} atualizado para 'running'.`,
				);
			} else if (campaign.status !== "running") {
				logger.info(
					`Campanha ${campaign.id} não está em status 'pending' ou 'running' (${campaign.status}). Pulando.`,
				);
				return;
			}
		} else {
			campaign = await this.findNextCampaignToProcess();
			if (!campaign) {
				logger.debug("Nenhuma campanha para processar no momento.");
				return;
			}
		}

		logger.info(
			`Iniciando processamento da campanha: ${campaign.name} (ID: ${campaign.id})`,
		);

		let recipient = await this.findNextRecipientToSend(campaign.id);

		while (recipient) {
			const instance = await this.selectSendingInstance(campaign);

			if (!instance) {
				logger.warn(
					`Nenhuma instância 'connected' disponível para enviar mensagens da campanha ${campaign.id}. Pausando processamento para esta campanha.`,
				);
				// O que fazer quando não há instâncias? Pausar a campanha? Tentar novamente mais tarde?
				// Por enquanto, vamos parar o loop para esta campanha e esperar que uma instância fique disponível.
				// Uma lógica mais avançada pode ser implementada aqui.
				await prisma.campaign.update({
					where: { id: campaign.id },
					data: { status: "paused", endTime: new Date() }, // Marca como pausada
				});
				logger.info(
					`Campanha ${campaign.id} pausada por falta de instâncias conectadas.`,
				);
				break; // Sai do loop de destinatários
			}

			try {
				await this.sendMessageToRecipient(campaign, recipient, instance);

				// Aguarda o intervalo dinâmico antes de processar o próximo destinatário
				const delay =
					Math.floor(
						Math.random() * (campaign.intervalMax - campaign.intervalMin + 1),
					) + campaign.intervalMin;
				logger.debug(`Aguardando ${delay} segundos antes do próximo envio.`);
				await new Promise((resolve) => setTimeout(resolve, delay * 1000)); // delay em milissegundos
			} catch (error) {
				// O erro já foi logado e o status do destinatário atualizado em sendMessageToRecipient
				logger.error(
					`Erro crítico durante o processamento do destinatário ${recipient.id}. Continuando para o próximo...`,
				);
				// Decide se continua para o próximo destinatário ou para a campanha.
				// Por enquanto, continua para o próximo.
			}

			// Busca o próximo destinatário pendente
			recipient = await this.findNextRecipientToSend(campaign.id);
		}

		// Verifica se todos os destinatários foram processados (status != 'pending')
		const remainingPending = await prisma.recipient.count({
			where: {
				campaignId: campaign.id,
				status: "pending",
			},
		});

		if (remainingPending === 0) {
			logger.info(
				`Todos os destinatários da campanha ${campaign.id} foram processados.`,
			);
			// Marca a campanha como concluída
			await prisma.campaign.update({
				where: { id: campaign.id },
				data: { status: "completed", endTime: new Date() },
			});
			logger.info(`Campanha ${campaign.id} marcada como 'completed'.`);
		} else {
			logger.info(
				`Processamento da campanha ${campaign.id} finalizado temporariamente. ${remainingPending} destinatário(s) ainda pendente(s).`,
			);
			// A campanha pode ter sido pausada por falta de instância ou haverá um próximo ciclo do worker.
		}

		logger.info(`Processamento da campanha ${campaign.id} concluído.`);
	}

	/**
	 * Lógica para processar o opt-out.
	 * Este método seria chamado por um webhook que recebe respostas.
	 * @param recipientNumber O número do destinatário que solicitou o opt-out.
	 * @param campaignId Opcional: Se souber a campanha específica.
	 */
	async handleOptOut(
		recipientNumber: string,
		campaignId?: string,
	): Promise<void> {
		logger.info(`Recebido pedido de opt-out do número: ${recipientNumber}.`);

		// Encontra o destinatário na campanha (ou em campanhas recentes se campaignId não for fornecido)
		const recipient = await prisma.recipient.findFirst({
			where: {
				number: recipientNumber,
				campaignId: campaignId, // Busca na campanha específica se fornecida
				status: {
					in: ["sent", "delivered", "read", "replied"], // Considera status onde a mensagem foi recebida
				},
			},
			orderBy: {
				sentAt: "desc", // Pega a entrada mais recente se houver múltiplas
			},
		});

		if (recipient) {
			if (recipient.status !== "opted-out") {
				await this.updateRecipientStatus(
					recipient.id,
					"opted-out",
					"Solicitou opt-out.",
				);
				logger.info(
					`Destinatário ${recipient.number} (ID: ${recipient.id}) marcado como 'opted-out'.`,
				);

				// Opcional: Incrementar contador de opt-out na campanha
				prisma.campaign
					.update({
						where: { id: recipient.campaignId },
						data: { optedOutCount: { increment: 1 } },
					})
					.catch((err) => {
						logger.error(
							`Erro ao incrementar optedOutCount para a campanha ${recipient.campaignId}:`,
							err,
						);
					});
			} else {
				logger.info(
					`Destinatário ${recipient.number} já estava marcado como 'opted-out'.`,
				);
			}
		} else {
			logger.warn(
				`Destinatário com número ${recipientNumber} não encontrado em status relevante para opt-out.`,
			);
		}

		// Opcional: Adicionar o número a uma lista global de "não perturbe" se aplicável.
	}

	// Adicionar lógica para processar webhooks da Evolution API para atualizar status (delivered, read, replied)
	// async handleWebhookUpdate(webhookData: any): Promise<void> {
	//     // Exemplo básico:
	//     const messageId = webhookData?.messageId; // Adapte conforme a estrutura do webhook
	//     const newStatus = webhookData?.status; // Adapte conforme a estrutura do webhook

	//     if (messageId && newStatus) {
	//         const logEntry = await prisma.sendingLog.findFirst({
	//             where: { details: { path: ['messageId'], equals: messageId } } // Busca o log pelo messageId
	//         });

	//         if (logEntry) {
	//             // Mapear status do webhook para status do Recipient/SendingLog
	//             let recipientStatus: Recipient['status'] | undefined;
	//             let logStatus: SendingLog['status'] = 'webhook_update'; // Status genérico para o log

	//             if (newStatus === 'DELIVERY_ACK') { // Exemplo de status da Evolution API
	//                 recipientStatus = 'delivered';
	//                 logStatus = 'webhook_delivered';
	//             } else if (newStatus === 'READ') {
	//                 recipientStatus = 'read';
	//                 logStatus = 'webhook_read';
	//             }
	//             // Adicionar outros status (replied, failed, etc.)

	//             if (recipientStatus) {
	//                  await this.updateRecipientStatus(logEntry.recipientId, recipientStatus);
	//             }

	//             // Atualiza o log com o novo status e detalhes do webhook
	//             await prisma.sendingLog.update({
	//                 where: { id: logEntry.id },
	//                 data: {
	//                     status: logStatus,
	//                     details: { ...logEntry.details as any, webhook: webhookData } // Adiciona os dados do webhook aos detalhes existentes
	//                 }
	//             });
	//              logger.info(`Webhook processado para messageId ${messageId}. Status atualizado para '${recipientStatus || logStatus}'.`);

	//         } else {
	//             logger.warn(`Webhook recebido para messageId ${messageId}, mas log de envio não encontrado.`);
	//         }
	//     } else {
	//         logger.warn('Webhook recebido com dados insuficientes para processar.', webhookData);
	//     }
	// }
}

export const campaignSenderService = new CampaignSenderService();

// Exemplo de como você pode rodar isso em um worker ou scheduler:
// import { campaignSenderService } from './services/campaignSender.service';

// const runSender = async () => {
//     logger.info('Worker de envio de campanha iniciado.');
//     while (true) { // Loop infinito para um worker
//         try {
//             await campaignSenderService.processCampaign();
//             // Espera um pouco antes de buscar a próxima campanha para não sobrecarregar
//             await new Promise(resolve => setTimeout(resolve, 10000)); // Espera 10 segundos
//         } catch (error) {
//             logger.error('Erro no worker de envio de campanha:', error);
//             // Em caso de erro, espera um pouco mais antes de tentar novamente
//             await new Promise(resolve => setTimeout(resolve, 30000)); // Espera 30 segundos
//         }
//     }
// };

// // Para iniciar o worker (em um script separado ou no bootstrap da sua aplicação)
// // runSender();
