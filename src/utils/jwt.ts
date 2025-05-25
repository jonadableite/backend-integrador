// backend-integrador/src/utils/jwt.ts
import jwt from "jsonwebtoken";
import type { UserRequest } from "../types";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

export function generateToken(user: UserRequest): string {
	const payload = {
		id: user.id,
		email: user.email,
		isAdmin: user.isAdmin,
		evoIaUserId: user.evoIaUserId,
	};

	const options: jwt.SignOptions = {
		expiresIn: "24h",
	};

	return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token: string): UserRequest {
	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		return decoded as UserRequest;
	} catch (error) {
		throw new Error("Invalid token");
	}
}
