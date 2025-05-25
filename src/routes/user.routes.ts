// backend-integrador/src/routes/user.routes.ts
import { type Request, type Response, Router } from "express";
import {
	getAllUsers,
	getProfile,
	registerUserFromEvoIA,
	syncUser,
} from "../controllers/user.controller";
import { authenticate, requireAdmin } from "../middlewares/auth";

const router = Router();

const asyncHandler = (
	fn: (req: Request, res: Response) => Promise<Response>,
) => {
	return (req: Request, res: Response): void => {
		fn(req, res).catch((error) => {
			console.error("Route error:", error);
			res.status(500).json({ error: "Internal server error" });
		});
	};
};

// Rota para o front-end registrar um usuário da Evo-IA
router.post("/register-from-evoia", asyncHandler(registerUserFromEvoIA));

// Rotas autenticadas
router.get("/profile", authenticate, asyncHandler(getProfile));
router.get("/sync/:userId", authenticate, requireAdmin, asyncHandler(syncUser));
router.get("/all", authenticate, requireAdmin, asyncHandler(getAllUsers));

export default router;
