import { PrismaClient } from "@prisma/client";
// backend-integrador/src/controllers/userController.ts
import type { Request, Response } from "express";
import { fetchUserFromEvoIA } from "../services/evoIa.service";
import type { AuthRequest } from "../types";

const prisma = new PrismaClient();

export async function getProfile(
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

		return res.status(200).json(user);
	} catch (error) {
		console.error("Error getting profile:", error);
		return res.status(500).json({ error: "Failed to get profile" });
	}
}

export async function syncUser(req: Request, res: Response): Promise<Response> {
	try {
		const { userId } = req.params;

		// Buscar usuário na Evo-IA
		const evoIaUser = await fetchUserFromEvoIA(userId);

		// Criar ou atualizar usuário no nosso backend
		const user = await prisma.user.upsert({
			where: { evoIaUserId: userId },
			update: {
				email: evoIaUser.email,
				name: evoIaUser.name,
				isActive: evoIaUser.is_active,
				isAdmin: evoIaUser.is_admin,
			},
			create: {
				evoIaUserId: userId,
				email: evoIaUser.email,
				name: evoIaUser.name,
				isActive: evoIaUser.is_active,
				isAdmin: evoIaUser.is_admin,
			},
		});

		return res.status(200).json(user);
	} catch (error) {
		console.error("Error syncing user:", error);
		return res.status(500).json({ error: "Failed to sync user" });
	}
}

export async function getAllUsers(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const users = await prisma.user.findMany({
			include: {
				instances: {
					select: {
						id: true,
						name: true,
						status: true,
					},
				},
			},
		});

		return res.status(200).json(users);
	} catch (error) {
		console.error("Error getting users:", error);
		return res.status(500).json({ error: "Failed to get users" });
	}
}

// Nova função para o fluxo do front-end
export async function registerUserFromEvoIA(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const { evoIaUserId } = req.body;

		if (!evoIaUserId) {
			return res.status(400).json({ error: "Evo-IA User ID is required" });
		}

		// Verificar se o usuário já existe
		const existingUser = await prisma.user.findUnique({
			where: { evoIaUserId },
		});

		if (existingUser) {
			return res.status(200).json({
				message: "User already exists",
				user: existingUser,
			});
		}

		// Buscar usuário na Evo-IA
		const evoIaUser = await fetchUserFromEvoIA(evoIaUserId);

		// Criar usuário no nosso sistema
		const newUser = await prisma.user.create({
			data: {
				evoIaUserId: evoIaUser.id,
				email: evoIaUser.email,
				name: evoIaUser.name,
				isActive: evoIaUser.is_active,
				isAdmin: evoIaUser.is_admin,
			},
		});

		return res.status(201).json({
			message: "User registered successfully",
			user: newUser,
		});
	} catch (error) {
		console.error("Error registering user from Evo-IA:", error);
		return res.status(500).json({ error: "Failed to register user" });
	}
}
