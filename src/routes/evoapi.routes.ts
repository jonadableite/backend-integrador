// backend-integrador/src/routes/evoapi.routes.ts
import { type Request, type Response, Router } from "express";
import {
	createInstance,
	deleteUserInstance,
	getInstanceQRCode,
	getUserInstances,
	syncInstancesFromEvolutionAPI,
} from "../controllers/instance.controller";
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

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas de instância vinculada ao usuário
router.post("/create", asyncHandler(createInstance));
router.get("/user", asyncHandler(getUserInstances));
router.get("/list", asyncHandler(getUserInstances)); // Manter compatibilidade
router.delete("/:instanceId", asyncHandler(deleteUserInstance));
router.get("/qrcode/:instanceId", asyncHandler(getInstanceQRCode));

// Rotas administrativas
router.post("/sync", requireAdmin, asyncHandler(syncInstancesFromEvolutionAPI));

export default router;
