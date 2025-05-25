// backend-integrador/src/routes/authRoutes.ts
import { type Request, type Response, Router } from "express";
import { login } from "../controllers/auth.controller";

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

router.post("/login", asyncHandler(login));

export default router;
