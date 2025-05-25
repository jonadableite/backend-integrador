import { PrismaClient } from "@prisma/client";
// backend-integrador/src/controllers/integration.controller.ts
import type { Request, Response } from "express";
import { authenticateWithEvoIA } from "../services/evoIa.service";
import {
	createInstanceInEvolutionAPI,
	getInstanceQRCode,
} from "../services/evolutionApi.service";
import type { AuthRequest } from "../types";
import { generateToken } from "../utils/jwt";

const prisma = new PrismaClient();

// Endpoint principal para login e vinculação
export async function loginAndSync(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "Email and password are required" });
		}

		console.log("🔍 Attempting login for:", email);

		// Autenticar na Evo-IA
		const evoIaAuth = await authenticateWithEvoIA(email, password);
		const evoIaUser = evoIaAuth.user;
		const evoIaToken = evoIaAuth.token;

		console.log("🔍 Evo-IA user data:", evoIaUser);
		console.log("🔍 Evo-IA user ID:", evoIaUser.id);
		console.log("🔍 Evo-IA user client_id:", evoIaUser.client_id);

		// Verificar se usuário já existe no nosso sistema
		let user = await prisma.user.findUnique({
			where: { evoIaUserId: evoIaUser.id },
		});

		// Se não existir, criar
		if (!user) {
			user = await prisma.user.create({
				data: {
					evoIaUserId: evoIaUser.id,
					email: evoIaUser.email,
					name: evoIaUser.email,
					isActive: evoIaUser.is_active,
					isAdmin: evoIaUser.is_admin,
				},
			});
			console.log("🔍 New user created in integrator DB:", user);
		} else {
			// Atualizar dados existentes
			user = await prisma.user.update({
				where: { id: user.id },
				data: {
					email: evoIaUser.email,
					isActive: evoIaUser.is_active,
					isAdmin: evoIaUser.is_admin,
				},
			});
			console.log("🔍 Existing user updated in integrator DB:", user);
		}

		// Gerar token JWT do integrador
		const integratorToken = generateToken({
			id: user.id,
			email: user.email,
			isAdmin: user.isAdmin,
			evoIaUserId: user.evoIaUserId,
		});

		const responseData = {
			message: "Login successful",
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				isAdmin: user.isAdmin,
				evoIaUserId: user.evoIaUserId,
				// IMPORTANTE: Usar o client_id correto da Evo-IA
				client_id: evoIaUser.client_id || evoIaUser.id, // Usar client_id do evoIaUser, não do user local
			},
			tokens: {
				integrator: integratorToken,
				evoIa: evoIaToken,
			},
		};

		console.log("🔍 Response being sent:", responseData);

		return res.status(200).json(responseData);
	} catch (error) {
		console.error("❌ Login and sync error:", error);
		return res.status(401).json({
			error: "Authentication failed. Please check your credentials.",
		});
	}
}

// Criar instância e vincular ao usuário
export async function createUserInstance(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;
		const { instanceName } = req.body;

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

		// Verificar se já existe uma instância com esse nome para o usuário
		const existingInstance = await prisma.instance.findFirst({
			where: {
				name: instanceName,
				userId: userId,
			},
		});

		if (existingInstance) {
			return res.status(400).json({
				error: "Instance with this name already exists for this user",
			});
		}

		// Criar instância na Evolution API
		const evolutionInstance = await createInstanceInEvolutionAPI(instanceName);

		// Registrar a instância no backend integrador
		const instance = await prisma.instance.create({
			data: {
				evolutionApiId: evolutionInstance.id,
				name: instanceName,
				status: evolutionInstance.connectionStatus,
				userId: userId,
			},
		});

		// Tentar obter o QR code
		let qrCode = null;
		try {
			qrCode = await getInstanceQRCode(instanceName);
		} catch (error) {
			console.log("QR Code not available yet");
		}

		return res.status(201).json({
			message: "Instance created successfully",
			instance,
			qrCode,
		});
	} catch (error) {
		console.error("Error creating instance:", error);
		return res.status(500).json({ error: "Failed to create instance" });
	}
}

// Obter dashboard do usuário (instâncias + agentes)
export async function getUserDashboard(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		// Buscar usuário com instâncias
		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: {
				instances: true,
			},
		});

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Buscar agentes na Evo-IA (se tiver token)
		const agents: never[] = [];
		// Nota: Aqui você precisaria do token da Evo-IA armazenado ou repassado
		// Por enquanto, retornamos apenas as instâncias

		return res.status(200).json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				isAdmin: user.isAdmin,
			},
			instances: user.instances,
			agents,
		});
	} catch (error) {
		console.error("Error getting dashboard:", error);
		return res.status(500).json({ error: "Failed to get dashboard" });
	}
}

// Endpoint compatível para verificar autenticação (similar ao /auth/me da Evo-IA)
export async function getCurrentUser(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const authReq = req as AuthRequest;
		const userId = authReq.user?.id;

		if (!userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { instances: true },
		});

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Retornar em formato compatível com Evo-IA
		return res.status(200).json({
			id: user.evoIaUserId, // Usar o ID da Evo-IA
			email: user.email,
			is_active: user.isActive,
			is_admin: user.isAdmin,
			client_id: user.evoIaUserId,
			email_verified: true,
			created_at: user.createdAt,
			updated_at: user.updatedAt,
		});
	} catch (error) {
		console.error("Error getting current user:", error);
		return res.status(500).json({ error: "Failed to get current user" });
	}
}
