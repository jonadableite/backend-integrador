// src/routes/webhook.routes.ts
import { PrismaClient } from "@prisma/client";
import { type Request, type Response, Router } from "express";

const router = Router();
const prisma = new PrismaClient();

const asyncHandler = (
	fn: (req: Request, res: Response) => Promise<Response>,
) => {
	return (req: Request, res: Response): void => {
		fn(req, res).catch((error) => {
			console.error("Webhook error:", error);
			res.status(500).json({ error: "Failed to process webhook" });
		});
	};
};

// Webhook para eventos da Evo-IA
router.post(
	"/evo-ia",
	asyncHandler(async (req: Request, res: Response) => {
		const { event, data } = req.body;

		if (event === "user.created" || event === "user.updated") {
			await prisma.user.upsert({
				where: { evoIaUserId: data.id },
				update: {
					email: data.email,
					name: data.name,
					isActive: data.is_active,
					isAdmin: data.is_admin,
				},
				create: {
					evoIaUserId: data.id,
					email: data.email,
					name: data.name,
					isActive: data.is_active,
					isAdmin: data.is_admin,
				},
			});
		}

		return res.status(200).json({ success: true });
	}),
);

// Webhook para eventos da Evolution API
router.post(
	"/evolution-api",
	asyncHandler(async (req: Request, res: Response) => {
		const { instanceName, event, data } = req.body;

		if (event === "CONNECTION_UPDATE") {
			// Buscar a instância pelo nome
			const instance = await prisma.instance.findFirst({
				where: { name: instanceName },
			});

			if (instance) {
				await prisma.instance.update({
					where: { id: instance.id },
					data: { status: data.state },
				});
			}
		}

		return res.status(200).json({ success: true });
	}),
);

export default router;
