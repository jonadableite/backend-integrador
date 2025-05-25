// backend-integrador/src/controllers/instance.controller.ts
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import type { Request, Response } from "express";
import {
	createInstanceInEvolutionAPI,
	deleteInstance,
	fetchAllInstances,
	getInstanceStatus,
} from "../services/evolutionApi.service";
import type { AuthRequest } from "../types";

const prisma = new PrismaClient();

export async function createInstance(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;
		const {
			instanceName,
			integration = "WHATSAPP-BAILEYS",
			qrcode = true,
		} = req.body;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		if (!instanceName) {
			return res.status(400).json({ error: "Instance name is required" });
		}

		// Verificar se o usuário existe
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		console.log(
			`🏗️  Creating instance "${instanceName}" for user ${user.email}`,
		);

		// Criar instância na Evolution API
		const evolutionResponse = await createInstanceInEvolutionAPI({
			instanceName,
			integration,
			qrcode,
		});

		console.log("✅ Evolution API response:", evolutionResponse);

		// Registrar a instância no nosso sistema
		const instance = await prisma.instance.create({
			data: {
				evolutionApiId: evolutionResponse.instanceId || instanceName,
				name: instanceName,
				status: evolutionResponse.status || "created",
				userId: userId,
			},
		});

		console.log("✅ Instance created in database:", instance);

		// Retornar a instância com QR Code se disponível
		return res.status(201).json({
			...instance,
			qrcode: evolutionResponse.qrcode,
			base64: evolutionResponse.base64,
			evolutionData: evolutionResponse,
		});
	} catch (error: any) {
		console.error("❌ Error creating instance:", error);

		// Se o erro for de nome duplicado, retornar erro específico
		if (error.message && error.message.includes("already in use")) {
			return res.status(409).json({
				error: "Instance name already in use",
				message: "Este nome de instância já está em uso. Escolha outro nome.",
			});
		}

		return res.status(500).json({
			error: "Failed to create instance",
			details: error.message,
		});
	}
}

// ... resto das funções permanecem iguais
export async function getUserInstances(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const instances = await prisma.instance.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});

		// Buscar status atual de cada instância
		const instancesWithStatus = await Promise.all(
			instances.map(async (instance) => {
				try {
					const status = await getInstanceStatus(instance.name);
					return { ...instance, status: status };
				} catch (error) {
					return { ...instance, status: "unknown" };
				}
			}),
		);

		return res.status(200).json(instancesWithStatus);
	} catch (error) {
		console.error("Error getting instances:", error);
		return res.status(500).json({ error: "Failed to get instances" });
	}
}

export async function deleteUserInstance(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;
		const { instanceId } = req.params;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		// Verificar se a instância existe e pertence ao usuário
		const instance = await prisma.instance.findFirst({
			where: {
				id: instanceId,
				userId,
			},
		});

		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or not owned by you" });
		}

		// Deletar instância na Evolution API
		await deleteInstance(instance.name);

		// Deletar instância no nosso sistema
		await prisma.instance.delete({
			where: { id: instanceId },
		});

		return res.status(200).json({ message: "Instance deleted successfully" });
	} catch (error) {
		console.error("Error deleting instance:", error);
		return res.status(500).json({ error: "Failed to delete instance" });
	}
}

export async function syncInstancesFromEvolutionAPI(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		if (!authReq.user?.isAdmin) {
			return res.status(403).json({ error: "Admin access required" });
		}

		const evolutionInstances = await fetchAllInstances();

		const results = await Promise.all(
			evolutionInstances.map(async (evolutionInstance) => {
				const existingInstance = await prisma.instance.findFirst({
					where: { evolutionApiId: evolutionInstance.id },
				});

				if (existingInstance) {
					return {
						id: existingInstance.id,
						name: existingInstance.name,
						status: "already_exists",
					};
				} else {
					const newInstance = await prisma.instance.create({
						data: {
							evolutionApiId: evolutionInstance.id,
							name: evolutionInstance.name,
							status: evolutionInstance.connectionStatus,
							userId: authReq.user!.id,
						},
					});

					return {
						id: newInstance.id,
						name: newInstance.name,
						status: "created",
					};
				}
			}),
		);

		return res.status(200).json(results);
	} catch (error) {
		console.error("Error syncing instances:", error);
		return res.status(500).json({ error: "Failed to sync instances" });
	}
}

export async function getInstanceQRCode(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const { instanceId } = req.params;
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		// Verificar se a instância existe e pertence ao usuário
		const instance = await prisma.instance.findFirst({
			where: {
				id: instanceId,
				userId,
			},
		});

		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or not owned by you" });
		}

		// Buscar QR code da Evolution API
		try {
			const response = await axios.get(
				`${process.env.EVOLUTION_API_URL}/instance/connect/${instance.name}`,
				{
					headers: {
						apikey: process.env.EVOLUTION_API_KEY,
						"Content-Type": "application/json",
					},
				},
			);

			return res.status(200).json(response.data);
		} catch (error) {
			return res.status(500).json({ error: "Failed to get QR code" });
		}
	} catch (error) {
		console.error("Error getting QR code:", error);
		return res.status(500).json({ error: "Failed to get QR code" });
	}
}
