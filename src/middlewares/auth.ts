// backend-integrador/src/middlewares/auth.ts
import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../types";
import { verifyToken } from "../utils/jwt";

export function authenticate(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader) {
			res.status(401).json({ error: "No token provided" });
			return;
		}

		const parts = authHeader.split(" ");

		if (parts.length !== 2) {
			res.status(401).json({ error: "Token error" });
			return;
		}

		const [scheme, token] = parts;

		if (!/^Bearer$/i.test(scheme)) {
			res.status(401).json({ error: "Token malformatted" });
			return;
		}

		const user = verifyToken(token);
		(req as AuthRequest).user = user;

		next();
	} catch (error) {
		res.status(401).json({ error: "Invalid token" });
	}
}

export function requireAdmin(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authReq = req as AuthRequest;

	if (!authReq.user || !authReq.user.isAdmin) {
		res.status(403).json({ error: "Admin access required" });
		return;
	}

	next();
}
