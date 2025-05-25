import path from "node:path";
// src/config/env.config.ts.
import * as dotenv from "dotenv";

// Carrega as variáveis de ambiente do arquivo .env
// __dirname aponta para o diretório do arquivo atual (src/config)
// path.resolve() garante que o caminho é absoluto
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

interface LogConfig {
	LEVEL: string[];
	COLOR: boolean;
}

interface EvolutionApiConfig {
	URL: string;
	KEY: string;
}

interface EvoIAConfig {
	URL: string;
	KEY: string;
}

interface EnvConfig {
	NODE_ENV: string;
	PORT: number;
	DATABASE_URL: string;
	LOG: LogConfig;
	EVOLUTION_API: EvolutionApiConfig;
	EVO_IA_API: EvoIAConfig;
}

class ConfigService {
	private readonly envConfig: EnvConfig;

	constructor() {
		// Validação e parse das variáveis de ambiente
		const evolutionApiUrl = process.env.EVOLUTION_API_URL;
		const evolutionApiKey = process.env.EVOLUTION_API_KEY;
		const databaseUrl = process.env.DATABASE_URL;
		const nodeEnv = process.env.NODE_ENV || "development";
		const port = Number.parseInt(process.env.PORT || "3001", 10);
		const logLevel = process.env.LOG_LEVEL
			? process.env.LOG_LEVEL.split(",").map((level) =>
					level.trim().toUpperCase(),
				)
			: [
					"ERRO",
					"AVISAR",
					"DEPURAR",
					"INFO",
					"LOG",
					"VERBOSE",
					"DARK",
					"WEBHOOKS",
					"WEBSOCKET",
				]; // Níveis padrão
		const logColor = process.env.LOG_COLOR === "true"; // Converte para boolean

		// Realiza validações essenciais
		if (!databaseUrl) {
			throw new Error("Variável de ambiente DATABASE_URL não definida.");
		}
		if (!evolutionApiUrl || !evolutionApiKey) {
			throw new Error(
				"Variáveis de ambiente EVOLUTION_API_URL ou EVOLUTION_API_KEY não definidas.",
			);
		}
		if (!process.env.EVO_IA_API_URL || !process.env.EVO_IA_API_KEY) {
			throw new Error(
				"Variáveis de ambiente EVO_IA_API_URL ou EVO_IA_API_KEY não definidas.",
			);
		}
		if (Number.isNaN(port)) {
			throw new Error(
				`Variável de ambiente PORT inválida: ${process.env.PORT}`,
			);
		}

		this.envConfig = {
			NODE_ENV: nodeEnv,
			PORT: port,
			DATABASE_URL: databaseUrl,
			LOG: {
				LEVEL: logLevel,
				COLOR: logColor,
			},
			EVOLUTION_API: {
				URL: evolutionApiUrl,
				KEY: evolutionApiKey,
			},
			EVO_IA_API: {
				URL: process.env.EVO_IA_API_URL || "",
				KEY: process.env.EVO_IA_API_KEY || "",
			},
		};

		// Opcional: Logar a configuração carregada (exceto chaves sensíveis)
		// console.log('Configuração carregada:', {
		//     NODE_ENV: this.envConfig.NODE_ENV,
		//     PORT: this.envConfig.PORT,
		//     // DATABASE_URL: '***', // Não logar
		//     LOG: this.envConfig.LOG,
		//     EVOLUTION_API: { URL: this.envConfig.EVOLUTION_API.URL, KEY: '***' }, // Não logar a chave
		//     // ...
		// });
	}

	/**
	 * Obtém um valor de configuração usando notação de ponto (ex: 'LOG.LEVEL').
	 * @param key A chave da configuração.
	 * @returns O valor da configuração.
	 * @throws Error se a chave não for encontrada.
	 */
	public get<K extends keyof EnvConfig>(key: K): EnvConfig[K];
	public get<K extends keyof EnvConfig, SK extends keyof EnvConfig[K]>(
		key: `${K}.${SK}`,
	): EnvConfig[K][SK];
	public get(key: string): any {
		const keys = key.split(".");
		let value: any = this.envConfig;

		for (const k of keys) {
			if (value === undefined || value === null || !(k in value)) {
				// Em vez de lançar um erro, pode retornar undefined ou null
				// Para variáveis essenciais, a validação no construtor já deve ter ocorrido.
				console.warn(`Chave de configuração "${key}" não encontrada.`);
				return undefined; // Ou null, ou lance um erro se preferir
			}
			value = value[k];
		}
		return value;
	}
}

// Exporta uma única instância do serviço de configuração (Singleton)
export const configService = new ConfigService();
