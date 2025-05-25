// src/types/evolutionApi.types.ts

/**
 * Representa uma instância da Evolution API.
 */
export interface EvolutionInstance {
	instanceId: string;
	id: string; // Pode ser o instanceId ou name
	name: string; // Nome da instância
	connectionStatus: string; // Status da conexão (ex: connected, disconnected, qrcode)
	qrcode?: string; // Código QR em base64 (presente quando o status for 'qrcode')
	base64?: string; // Alias para qrcode
	hash?: string; // Hash associado ao QR code
	settings?: any; // Configurações da instância
	status?: string;
}

/**
 * Button types.
 */
export type TypeButton = "reply" | "copy" | "url" | "call" | "pix";

export class Button {
	type: TypeButton;
	displayText?: string;
	id?: string;
	url?: string;
	copyCode?: string;
	phoneNumber?: string;
	currency?: string;
	name?: string;
	keyType?: KeyType;
	key?: string;
}

export class SendButtonsDto extends Metadata {
	thumbnailUrl?: string;
	title: string;
	description?: string;
	footer?: string;
	buttons: Button[];
}

export interface SendTextDto {
	number: string;
	text: string;
	// ... outras propriedades para enviar texto
}

/**
 * Parâmetros para criar uma nova instância na Evolution API.
 */
export interface CreateInstanceParams {
	instanceName: string;
	integration?: "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS";
	qrcode?: boolean;
	// Adicione outras opções de criação de instância conforme a API permite (webhook, rabbitmq, settings iniciais)
	webhook?: {
		enabled: boolean;
		url: string;
		headers?: { [key: string]: string };
		byEvents?: boolean;
		base64?: boolean;
		events?: string[];
	};
	settings?: {
		alwaysOnline?: boolean;
		readMessages?: boolean;
		readStatus?: boolean;
		rejectCall?: boolean;
		msgCall?: string;
		groupsIgnore?: boolean;
		syncFullHistory?: boolean;
	};
}

/**
 * Tipos para o status de conexão de uma instância.
 */
export type ConnectionState =
	| "connecting"
	| "open"
	| "close"
	| "unknown"
	| "error";

/**
 * Parâmetros para enviar uma mensagem de texto.
 */
export interface SendTextParams {
	number: string; // Número do destinatário com código do país (ex: 559999999999)
	text: string; // Conteúdo da mensagem de texto
	options?: {
		// Opções adicionais (opcional)
		delay?: number; // Atraso no envio em ms
		quoted?: {
			// Mensagem citada (opcional)
			key?: { id: string }; // ID da mensagem original
			message?: { conversation: string }; // Conteúdo da mensagem original (se não tiver ID)
		};
		linkPreview?: boolean; // Habilitar preview de link
		mentionsEveryOne?: boolean; // Mencionar todos no grupo
		mentioned?: string[]; // Lista de números a serem mencionados
	};
}

/**
 * Parâmetros para enviar um arquivo de mídia.
 */
export interface SendMediaParams {
	number: string; // Número do destinatário com código do país
	mediaMessage: {
		// Detalhes da mídia
		url?: string; // URL do arquivo de mídia
		base64?: string; // Arquivo de mídia em base64
		caption?: string; // Legenda da mídia
		fileName?: string; // Nome do arquivo (opcional, útil para base64)
		mimetype?: string; // Tipo MIME do arquivo (opcional, útil para base64)
	};
	options?: {
		// Opções adicionais (opcional)
		delay?: number;
		quoted?: {
			key?: { id: string };
			message?: any; // Pode ser qualquer tipo de mensagem citada
		};
		mentionsEveryOne?: boolean;
		mentioned?: string[];
	};
}

/**
 * Parâmetros para enviar um áudio narrado (formato OGG/Opus).
 */
export interface SendNarratedAudioParams {
	number: string; // Número do destinatário com código do país
	audio: string; // URL ou base64 do arquivo de áudio (deve ser OGG/Opus para áudio narrado)
	options?: {
		// Opções adicionais (opcional)
		delay?: number;
		quoted?: {
			key?: { id: string };
			message?: any;
		};
		mentionsEveryOne?: boolean;
		mentioned?: string[];
		encoding?: boolean; // Se true, a API tentará converter o áudio para o formato correto
	};
}

/**
 * Resposta genérica da API.
 */
export interface ApiResponse<T = any> {
	status: boolean;
	response: T;
}

/**
 * Resposta da API para criação de instância.
 */
export interface CreateInstanceResponse extends ApiResponse {
	response: {
		message: string | string[]; // Pode ser uma string ou array de strings
		instance?: EvolutionInstance; // Detalhes da instância criada
		qrcode?: string; // QR code em base64
		base64?: string; // Alias para qrcode
		hash?: string;
		status?: string;
		// Outras propriedades que a API possa retornar
	};
}

/**
 * Resposta da API para status de conexão.
 */
export interface ConnectionStateResponse extends ApiResponse {
	response: {
		state: ConnectionState;
		connectionStatus?: ConnectionState; // Alias
		// Outras propriedades de status
	};
}

/**
 * Resposta da API para buscar instâncias.
 */
export interface FetchInstancesResponse extends ApiResponse {
	response: {
		instances: EvolutionInstance[];
		// Outras propriedades
	};
}

/**
 * Resposta da API para obter QR Code.
 */
export interface GetQRCodeResponse extends ApiResponse {
	response: {
		qrcode?: string;
		base64?: string; // Alias
		// Outras propriedades
	};
}

/**
 * Resposta da API para envio de mensagem.
 */
export interface SendMessageResponse extends ApiResponse {
	response: {
		message: string; // Mensagem de sucesso/erro
		messageId?: string; // ID da mensagem enviada
		// Outras propriedades
	};
}
