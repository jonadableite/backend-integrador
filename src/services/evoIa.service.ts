// backend-integrador/src/services/evoIa.service.ts
import axios from "axios";
import type { EvoIAUser } from "../types";

const API_URL = process.env.EVO_IA_API_URL || "";
const API_KEY = process.env.EVO_IA_API_KEY || "";

export async function authenticateWithEvoIA(
	email: string,
	password: string,
): Promise<{ user: EvoIAUser; token: string }> {
	try {
		// Login na Evo-IA
		const loginResponse = await axios.post(`${API_URL}/api/v1/auth/login`, {
			email,
			password,
		});

		const token = (loginResponse.data as { access_token: string }).access_token;

		// Buscar dados do usuário atual
		const userResponse = await axios.post(
			`${API_URL}/api/v1/auth/me`,
			{},
			{
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			},
		);

		return {
			user: userResponse.data as EvoIAUser,
			token,
		};
	} catch (error) {
		console.error("Error authenticating with Evo-IA:", error);
		throw new Error("Failed to authenticate with Evo-IA");
	}
}

export async function fetchUserFromEvoIA(
	userId: string,
	token?: string,
): Promise<EvoIAUser> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const headers: any = {
			"Content-Type": "application/json",
		};

		if (token) {
			// biome-ignore lint/complexity/useLiteralKeys: <explanation>
			headers["Authorization"] = `Bearer ${token}`;
		} else if (API_KEY) {
			// biome-ignore lint/complexity/useLiteralKeys: <explanation>
			headers["Authorization"] = `Bearer ${API_KEY}`;
		}

		const response = await axios.post(
			`${API_URL}/api/v1/auth/me`,
			{},
			{ headers },
		);

		return response.data as EvoIAUser;
	} catch (error) {
		console.error("Error fetching user from Evo-IA:", error);
		throw new Error("Failed to fetch user from Evo-IA");
	}
}

export async function fetchClientAgents(
	clientId: string,
	token: string,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
): Promise<any[]> {
	try {
		const response = await axios.get(`${API_URL}/api/v1/agents/`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"x-client-id": clientId,
				"Content-Type": "application/json",
			},
		});

		return Array.isArray(response.data) ? response.data : [];
	} catch (error) {
		console.error("Error fetching agents from Evo-IA:", error);
		return [];
	}
}
