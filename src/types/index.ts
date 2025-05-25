// backend-integrador/src/types/index.ts
import type { Request } from "express";

export interface UserRequest {
	id: string;
	email: string;
	isAdmin: boolean;
	evoIaUserId: string;
}

export interface EvoIAUser {
	id: string;
	name: string;
	email: string;
	is_active: boolean;
	is_admin: boolean;
	client_id?: string;
	email_verified?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface EvolutionInstance {
	instanceId: any;
	status: string;
	qrcode: any;
	base64: any;
	id: string;
	name: string;
	connectionStatus: string;
}

export interface AuthRequest extends Request {
	user?: UserRequest;
}
