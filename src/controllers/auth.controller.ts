import { PrismaClient } from "@prisma/client";
// backend-integrador/src/controllers/auth.controller.ts
import type { Request, Response } from "express";
import { authenticateWithEvoIA } from "../services/evoIa.service";
import { generateToken } from "../utils/jwt";

const prisma = new PrismaClient();

export async function login(req: Request, res: Response): Promise<Response> {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			return res.status(400).json({ error: "Email and password are required" });
		}

		// Autenticar na Evo-IA usando email e senha
		const { user: evoIaUser, token: evoIaToken } = await authenticateWithEvoIA(
			email,
			password,
		);

		// Verificar se o usuário já existe no nosso sistema
		let user = await prisma.user.findUnique({
			where: { evoIaUserId: evoIaUser.id },
		});

		// Se não existir, criar o usuário
		if (!user) {
			user = await prisma.user.create({
				data: {
					evoIaUserId: evoIaUser.id,
					email: evoIaUser.email,
					name: evoIaUser.email, // Usar email como nome se não tiver nome
					isActive: evoIaUser.is_active,
					isAdmin: evoIaUser.is_admin,
				},
			});
		} else {
			// Atualizar dados do usuário se já existir
			user = await prisma.user.update({
				where: { id: user.id },
				data: {
					email: evoIaUser.email,
					isActive: evoIaUser.is_active,
					isAdmin: evoIaUser.is_admin,
				},
			});
		}

		// Gerar token JWT para o backend integrador
		const token = generateToken({
			id: user.id,
			email: user.email,
			isAdmin: user.isAdmin,
			evoIaUserId: user.evoIaUserId,
		});

		return res.status(200).json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				isAdmin: user.isAdmin,
				evoIaUserId: user.evoIaUserId,
			},
			token,
			evoIaToken,
		});
	} catch (error) {
		console.error("Login error:", error);
		return res.status(401).json({ error: "Authentication failed" });
	}
}
