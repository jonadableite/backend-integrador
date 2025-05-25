// src/routes/integration.routes.ts
import { type Request, type Response, Router } from "express";
import {
	createUserInstance,
	getCurrentUser,
	getUserDashboard,
	loginAndSync,
} from "../controllers/integration.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

// Wrapper para corrigir o tipo de retorno
const asyncHandler = (
	fn: (req: Request, res: Response) => Promise<Response>,
) => {
	return (req: Request, res: Response): void => {
		fn(req, res).catch((error) => {
			console.error("Integration route error:", error);
			res.status(500).json({ error: "Internal server error" });
		});
	};
};

// Login que sincroniza usuário da Evo-IA e retorna tokens
router.post("/login", asyncHandler(loginAndSync));

// Endpoint compatível para verificar usuário atual (como /auth/me da Evo-IA)
router.post("/me", authenticate, asyncHandler(getCurrentUser));
router.get("/me", authenticate, asyncHandler(getCurrentUser));

// Criar instância (requer autenticação)
router.post(
	"/instances/create",
	authenticate,
	asyncHandler(createUserInstance),
);

// Dashboard do usuário
router.get("/dashboard", authenticate, asyncHandler(getUserDashboard));

export default router;
