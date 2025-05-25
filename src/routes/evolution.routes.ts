// backend-integrador/src/routes/evolution.routes.ts
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { type Request, type Response, Router } from "express";
import { authenticate } from "../middlewares/auth";
import type { AuthRequest } from "../types";

const router = Router();
const prisma = new PrismaClient();

const API_URL = process.env.EVOLUTION_API_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

// Função para verificar acesso à instância
async function checkInstanceAccess(req: AuthRequest, instanceName: string) {
	const userId = req.user?.id;

	if (!userId) {
		return null;
	}

	const instance = await prisma.instance.findFirst({
		where: {
			name: instanceName,
			userId: userId,
		},
	});

	return instance;
}

// Aplicar autenticação a todas as rotas
router.use(authenticate);

// Buscar instâncias com dados completos
router.get("/instances", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const userInstances = await prisma.instance.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
		});

		// Buscar dados completos da API para cada instância
		const instancesWithDetails = await Promise.all(
			userInstances.map(async (instance) => {
				try {
					console.log(`🔍 Fetching details for instance: ${instance.name}`);

					const response = await axios.get(
						`${API_URL}/instance/fetchInstances`,
						{
							headers: { apikey: API_KEY },
							params: {
								instanceName: instance.name,
							},
						},
					);

					const apiData = response.data;
					let instanceData = null;

					if (Array.isArray(apiData) && apiData.length > 0) {
						instanceData = apiData[0]; // Pegar primeiro item do array
					} else if (!Array.isArray(apiData)) {
						instanceData = apiData;
					}

					if (instanceData) {
						// Atualizar dados no banco local
						const updatedInstance = await prisma.instance.update({
							where: { id: instance.id },
							data: {
								status:
									instanceData.connectionStatus ||
									instanceData.state ||
									"close",
								profileName: instanceData.profileName || null,
								profilePictureUrl: instanceData.profilePicUrl || null,
								ownerJid: instanceData.ownerJid || null,
								lastSeen: new Date(),
							},
						});

						return {
							...updatedInstance,
							// Garantir compatibilidade com diferentes nomes de campo
							profileName: instanceData.profileName || instance.name,
							profilePicUrl: instanceData.profilePicUrl,
							profilePictureUrl: instanceData.profilePicUrl,
							connectionStatus:
								instanceData.connectionStatus || instanceData.state || "close",
							status:
								instanceData.connectionStatus || instanceData.state || "close",
							ownerJid: instanceData.ownerJid,
							// Incluir dados adicionais se disponíveis
							integration: instance.integration,
							_count: instanceData._count,
						};
					} else {
						console.warn(`⚠️ No API data found for instance: ${instance.name}`);
						return {
							...instance,
							connectionStatus: "unknown",
							status: "unknown",
							profilePictureUrl: null,
							profilePicUrl: null,
						};
					}
				} catch (error) {
					console.error(
						`❌ Error fetching details for ${instance.name}:`,
						error,
					);
					return {
						...instance,
						connectionStatus: "error",
						status: "error",
						profilePictureUrl: null,
						profilePicUrl: null,
					};
				}
			}),
		);

		console.log(
			`✅ Returning ${instancesWithDetails.length} instances with details`,
		);
		res.json(instancesWithDetails);
	} catch (error) {
		console.error("❌ Error fetching instances:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Conectar instância (gerar QR code)
router.get("/connect/:instanceName", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const { instanceName } = req.params;
		const { number } = req.query;

		const instance = await checkInstanceAccess(authReq, instanceName);
		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or access denied" });
		}

		console.log(`🔌 Connecting instance: ${instanceName}`);

		const params = new URLSearchParams();
		if (number) params.append("number", number as string);

		const response = await axios.get(
			`${API_URL}/instance/connect/${instanceName}?${params.toString()}`,
			{
				headers: { apikey: API_KEY },
			},
		);

		console.log(`✅ Connect response for ${instanceName}:`, response.data);
		res.json(response.data);
	} catch (error: any) {
		console.error(`❌ Error connecting ${req.params.instanceName}:`, error);
		res.status(error.response?.status || 500).json({
			error: error.response?.data?.message || "Failed to connect instance",
		});
	}
});

// Status da conexão
router.get(
	"/connectionState/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			console.log(`🔍 Getting connection state for: ${instanceName}`);

			const response = await axios.get(
				`${API_URL}/instance/connectionState/${instanceName}`,
				{
					headers: { apikey: API_KEY },
				},
			);

			console.log(`📊 Connection state response:`, response.data);

			// Processar resposta para garantir formato consistente
			const data = response.data;
			const state = data?.instance?.state || data?.state || "unknown";

			res.json({
				state: state,
				connectionStatus: state,
				instance: {
					...data?.instance,
					instanceName,
					state: state,
					profilePictureUrl:
						data?.instance?.profilePictureUrl || data?.profilePictureUrl,
					profileName: data?.instance?.profileName || data?.profileName,
					ownerJid: data?.instance?.ownerJid || data?.ownerJid,
				},
			});
		} catch (error: any) {
			const { instanceName } = req.params; // Movido para dentro do catch
			console.error(
				`❌ Error getting connection state for ${instanceName}:`,
				error,
			);
			res.json({
				state: "error",
				connectionStatus: "error",
				instance: { instanceName, state: "error" },
			});
		}
	},
);

// Reiniciar instância
router.post("/restart/:instanceName", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const { instanceName } = req.params;

		const instance = await checkInstanceAccess(authReq, instanceName);
		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or access denied" });
		}

		const response = await axios.post(
			`${API_URL}/instance/restart/${instanceName}`,
			{},
			{
				headers: { apikey: API_KEY },
			},
		);

		res.json(response.data);
	} catch (error: any) {
		console.error(`❌ Error restarting ${req.params.instanceName}:`, error);
		res.status(error.response?.status || 500).json({
			error: error.response?.data?.message || "Failed to restart instance",
		});
	}
});

// Logout instância
router.delete("/logout/:instanceName", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const { instanceName } = req.params;

		const instance = await checkInstanceAccess(authReq, instanceName);
		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or access denied" });
		}

		const response = await axios.delete(
			`${API_URL}/instance/logout/${instanceName}`,
			{
				headers: { apikey: API_KEY },
			},
		);

		res.json(response.data);
	} catch (error: any) {
		console.error(`❌ Error logging out ${req.params.instanceName}:`, error);
		res.status(error.response?.status || 500).json({
			error: error.response?.data?.message || "Failed to logout instance",
		});
	}
});

// Deletar instância
router.delete("/delete/:instanceName", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const { instanceName } = req.params;

		const instance = await checkInstanceAccess(authReq, instanceName);
		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or access denied" });
		}

		// Deletar da API da Evolution
		await axios.delete(`${API_URL}/instance/delete/${instanceName}`, {
			headers: { apikey: API_KEY },
		});

		// Deletar do banco local
		await prisma.instance.delete({
			where: { id: instance.id },
		});

		res.json({ message: "Instance deleted successfully" });
	} catch (error: any) {
		console.error(`❌ Error deleting ${req.params.instanceName}:`, error);
		res.status(error.response?.status || 500).json({
			error: error.response?.data?.message || "Failed to delete instance",
		});
	}
});

// Criar instância
router.post("/create", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const {
			instanceName,
			integration = "WHATSAPP-BAILEYS",
			qrcode = true,
		} = req.body;

		if (!instanceName) {
			return res.status(400).json({ error: "Instance name is required" });
		}

		// Verificar se já existe
		const existingInstance = await prisma.instance.findFirst({
			where: {
				name: instanceName,
				userId: userId,
			},
		});

		if (existingInstance) {
			return res.status(400).json({ error: "Instance already exists" });
		}

		console.log(`🚀 Creating instance: ${instanceName}`);

		// Criar na API da Evolution
		const response = await axios.post(
			`${API_URL}/instance/create`,
			{
				instanceName,
				integration,
				qrcode,
			},
			{
				headers: {
					apikey: process.env.EVOLUTION_GLOBAL_API_KEY || API_KEY,
					"Content-Type": "application/json",
				},
			},
		);

		// Salvar no banco local
		const newInstance = await prisma.instance.create({
			data: {
				name: instanceName,
				evolutionApiId:
					response.data.instance?.instanceId || `${instanceName}-${Date.now()}`,
				instanceId:
					response.data.instance?.instanceId || `${instanceName}-${Date.now()}`,
				userId: userId,
				integration: integration,
				status: "created",
				apiKey: response.data.hash?.apikey || API_KEY,
			},
		});

		console.log(`✅ Instance created:`, newInstance);

		res.json({
			...response.data,
			localInstance: newInstance,
		});
	} catch (error: any) {
		console.error("❌ Error creating instance:", error);
		res.status(error.response?.status || 500).json({
			error: error.response?.data?.message || "Failed to create instance",
		});
	}
});

// Buscar todos os EvoAIs de uma instância
router.get("/evoai/find/:instanceName", async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;
		const { instanceName } = req.params;

		const instance = await checkInstanceAccess(authReq, instanceName);
		if (!instance) {
			return res
				.status(404)
				.json({ error: "Instance not found or access denied" });
		}

		const response = await axios.get(`${API_URL}/evoai/find/${instanceName}`, {
			headers: { apikey: API_KEY },
		});

		res.json(response.data);
	} catch (error: any) {
		console.error("Erro ao buscar EvoAIs:", error);
		res.status(500).json({ error: error.response?.data || error.message });
	}
});

// Criar novo EvoAI
router.post(
	"/evoai/create/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.post(
				`${API_URL}/evoai/create/${instanceName}`,
				req.body,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao criar EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Atualizar EvoAI
router.put(
	"/evoai/update/:evoaiId/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName, evoaiId } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.put(
				`${API_URL}/evoai/update/${evoaiId}/${instanceName}`,
				req.body,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao atualizar EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Deletar EvoAI
router.delete(
	"/evoai/delete/:evoaiId/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName, evoaiId } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.delete(
				`${API_URL}/evoai/delete/${evoaiId}/${instanceName}`,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao deletar EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Buscar configurações padrão
router.get(
	"/evoai/fetchSettings/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.get(
				`${API_URL}/evoai/fetchSettings/${instanceName}`,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao buscar configurações EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Salvar configurações padrão
router.post(
	"/evoai/settings/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.post(
				`${API_URL}/evoai/settings/${instanceName}`,
				req.body,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao salvar configurações EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Alterar status da sessão
router.post(
	"/evoai/changeStatus/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.post(
				`${API_URL}/evoai/changeStatus/${instanceName}`,
				req.body,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao alterar status EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

// Buscar sessões de um EvoAI
router.get(
	"/evoai/fetchSessions/:evoaiId/:instanceName",
	async (req: Request, res: Response) => {
		try {
			const authReq = req as AuthRequest;
			const { instanceName, evoaiId } = req.params;

			const instance = await checkInstanceAccess(authReq, instanceName);
			if (!instance) {
				return res
					.status(404)
					.json({ error: "Instance not found or access denied" });
			}

			const response = await axios.get(
				`${API_URL}/evoai/fetchSessions/${evoaiId}/${instanceName}`,
				{
					headers: { apikey: API_KEY },
				},
			);

			res.json(response.data);
		} catch (error: any) {
			console.error("Erro ao buscar sessões EvoAI:", error);
			res.status(500).json({ error: error.response?.data || error.message });
		}
	},
);

export default router;
