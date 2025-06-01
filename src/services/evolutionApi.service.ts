// backend-integrador/src/services/evolutionApi.service.ts

import axios from "axios";
import type { EvolutionInstance } from "../types";

const API_URL = process.env.EVOLUTION_API_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

interface CreateInstanceParams {
	instanceName: string;
	integration?: string;
	qrcode?: boolean;
}

export async function createInstanceInEvolutionAPI(
	params: CreateInstanceParams,
): Promise<any> {
	try {
		console.log("🔄 Creating instance in Evolution API:", params);

		const response = await axios.post(
			`${API_URL}/instance/create`,
			{
				instanceName: params.instanceName,
				qrcode: params.qrcode || true,
				integration: params.integration || "WHATSAPP-BAILEYS",
			},
			{
				headers: {
					apikey: API_KEY,
					"Content-Type": "application/json",
				},
			},
		);

		const data = response.data as {
			instance?: { instanceId?: string; status?: string; qrcode?: string };
			instanceId?: string;
			status?: string;
			qrcode?: string;
			base64?: string;
			hash?: string;
			settings?: any;
		};

		console.log("✅ Evolution API response:", data);

		// A Evolution API pode retornar o QR code diretamente ou em uma propriedade específica
		return {
			instanceId:
				data.instance?.instanceId ||
				data.instanceId ||
				params.instanceName,
			instanceName: params.instanceName,
			status:
				data.instance?.status || data.status || "created",
			qrcode:
				data.qrcode ||
				data.base64 ||
				data.instance?.qrcode,
			base64: data.base64 || data.qrcode,
			hash: data.hash,
			settings: data.settings,
		};
	} catch (error: any) {
		console.error(
			"❌ Error creating instance in Evolution API:",
			error?.response?.data || error.message,
		);

		// Tratar erro de nome duplicado
		if (
			error?.response?.status === 403 &&
			error?.response?.data?.response?.message
		) {
			const message = error.response.data.response.message;
			if (
				Array.isArray(message) &&
				message.some((msg) => msg.includes("already in use"))
			) {
				throw new Error("Instance name already in use");
			}
		}

		throw new Error(
			`Failed to create instance in Evolution API: ${error?.response?.data?.error || error.message}`,
		);
	}
}

export async function getInstanceStatus(instanceName: string): Promise<string> {
	try {
		const response = await axios.get(
			`${API_URL}/instance/connectionState/${instanceName}`,
			{
				headers: {
					apikey: API_KEY,
					"Content-Type": "application/json",
				},
			},
		);

		const data = response.data as { state?: string; connectionStatus?: string };
		return data.state || data.connectionStatus || "unknown";
	} catch (error) {
		console.error("Error getting instance status:", error);
		return "error";
	}
}

export async function deleteInstance(instanceName: string): Promise<void> {
	try {
		await axios.delete(`${API_URL}/instance/delete/${instanceName}`, {
			headers: {
				apikey: API_KEY,
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		console.error("Error deleting instance:", error);
		throw new Error("Failed to delete instance");
	}
}

export async function fetchAllInstances(): Promise<EvolutionInstance[]> {
	try {
		const response = await axios.get(`${API_URL}/instance/fetchInstances`, {
			headers: {
				apikey: API_KEY,
				"Content-Type": "application/json",
			},
		});

		const data = response.data as { instances?: any[] } | any[];
		const instances = (Array.isArray(data) ? data : data.instances) || [];

		return instances.map((instance: any) => ({
			id: instance.id || instance.name,
			name: instance.name || instance.instanceName,
			connectionStatus:
				instance.connectionStatus || instance.state || "unknown",
			instanceId: instance.instanceId || instance.id || instance.name,
			status: instance.status || instance.connectionStatus || instance.state || "unknown",
			qrcode: instance.qrcode || instance.base64 || "",
			base64: instance.base64 || "",
		}));
	} catch (error) {
		console.error("Error fetching all instances:", error);
		return [];
	}
}

export async function getInstanceQRCode(instanceName: string): Promise<string> {
	try {
		const response = await axios.get(
			`${API_URL}/instance/connect/${instanceName}`,
			{
				headers: {
					apikey: API_KEY,
					"Content-Type": "application/json",
				},
			},
		);

		const data = response.data as { qrcode?: string; base64?: string };
		return data.qrcode || data.base64 || "";
	} catch (error) {
		console.error("Error getting QR code:", error);
		throw new Error("Failed to get QR code");
	}
}
