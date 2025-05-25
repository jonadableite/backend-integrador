import fs from "node:fs";
import path from "node:path";
// src/utils/logger.ts
import dayjs from "dayjs";
import { configService } from "../config/env.config"; // Importa o serviço de configuração

const formatDateLog = (timestamp: number) =>
	dayjs(timestamp)
		.toDate()
		.toString()
		.replace(/\sGMT.+/, "");

enum Color {
	LOG = "\x1b[32m",
	INFO = "\x1b[34m",
	AVISAR = "\x1b[33m",
	ERROR = "\x1b[31m",
	DEPURAR = "\x1b[36m",
	VERBOSE = "\x1b[37m",
	DARK = "\x1b[30m",
	WEBHOOKS = "\x1b[35m",
	WEBSOCKET = "\x1b[38m",
	RESET = "\x1b[0m",
	BRIGHT = "\x1b[1m",
	UNDERSCORE = "\x1b[4m",
}

enum Level {
	LOG = Color.LOG + "%s" + Color.RESET,
	DARK = Color.DARK + "%s" + Color.RESET,
	INFO = Color.INFO + "%s" + Color.RESET,
	AVISAR = Color.AVISAR + "%s" + Color.RESET,
	ERROR = Color.ERROR + "%s" + Color.RESET,
	DEPURAR = Color.DEPURAR + "%s" + Color.RESET,
	VERBOSE = Color.VERBOSE + "%s" + Color.RESET,
	WEBHOOKS = Color.WEBHOOKS + "%s" + Color.RESET,
	WEBSOCKET = Color.WEBSOCKET + "%s" + Color.RESET,
}

enum Type {
	LOG = "LOG",
	AVISAR = "AVISAR",
	INFO = "INFO",
	DARK = "DARK",
	ERROR = "ERROR",
	DEPURAR = "DEPURAR",
	VERBOSE = "VERBOSE",
}

enum Background {
	LOG = "\x1b[42m",
	INFO = "\x1b[44m",
	WARN = "\x1b[43m",
	DARK = "\x1b[40m",
	ERROR = "\x1b[41m",
	DEBUG = "\x1b[46m",
	VERBOSE = "\x1b[47m",
}

// Tenta ler o package.json, se falhar, usa uma versão padrão
let packageJsonVersion = "N/A";
try {
	const packageJsonPath = path.join(__dirname, "../../package.json");
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	packageJsonVersion = packageJson.version;
} catch (e) {
	console.warn("Não foi possível ler package.json para a versão do logger.", e);
}

export class Logger {
	private context: string;
	private instanceId: string | null = null;
	// Obtém as configurações de log uma vez na inicialização da classe Logger
	private readonly enabledLevels: string[];
	private readonly useColor: boolean;

	constructor(context = "Logger") {
		this.context = context;
		// Usa o configService para obter as configurações de log
		this.enabledLevels = configService.get("LOG.LEVEL");
		this.useColor = configService.get("LOG.COLOR");
	}

	public setContext(value: string) {
		this.context = value;
	}

	public setInstance(instanceId: string | null) {
		this.instanceId = instanceId;
	}

	private console(value: any, type: Type) {
		// Usa as configurações obtidas no construtor
		if (!this.enabledLevels.includes(type)) {
			return;
		}

		const typeValue = typeof value;
		const timestamp = formatDateLog(Date.now());
		const processId = process.pid.toString();
		const instanceTag = this.instanceId ? `[${this.instanceId}]` : "";
		const contextTag = `[${this.context}]`;
		const typeTag = `[${typeValue}]`;
		const message = typeValue !== "object" ? value : "";

		if (this.useColor) {
			// Usa a configuração obtida no construtor
			console.log(
				`${Color.BRIGHT}${Level[type]}`,
				`[WhatLead API]`,
				`${Color.BRIGHT}${Color[type]}`,
				`${instanceTag}`,
				`${Color.BRIGHT}${Color[type]}`,
				`v${packageJsonVersion}`,
				`${Color.BRIGHT}${Color[type]}`,
				`${processId}`,
				`${Color.RESET}`,
				`${Color.BRIGHT}${Color[type]}`,
				`-`,
				`${Color.BRIGHT}${Color.VERBOSE}`,
				`${timestamp} `,
				`${Color.RESET}`,
				`${Color[type]}${Background[type]}${Color.BRIGHT}`,
				`${type} ${Color.RESET}`,
				`${Color.WARN}${Color.BRIGHT}`,
				`${contextTag}${Color.RESET}`,
				`${Color[type]}${Color.BRIGHT}`,
				`${typeTag}${Color.RESET}`,
				`${Color[type]}`,
				`${message}`,
				`${Color.RESET}`,
			);
			if (typeValue === "object") {
				console.log(value, "\n");
			}
		} else {
			console.log(
				`[WhatLead API]`,
				`${instanceTag}`,
				`${processId}`,
				`-`,
				`${timestamp} `,
				`${type} `,
				`${contextTag}`,
				`${typeTag}`,
				value,
			);
		}
	}

	public log(value: any) {
		this.console(value, Type.LOG);
	}

	public info(value: any) {
		this.console(value, Type.INFO);
	}

	public aviso(value: any) {
		this.console(value, Type.WARN);
	}

	public error(value: any, error: any) {
		this.console(value, Type.ERROR);
	}

	public verbose(value: any) {
		this.console(value, Type.VERBOSE);
	}

	public depurar(value: any) {
		this.console(value, Type.DEBUG);
	}

	public dark(value: any) {
		this.console(value, Type.DARK);
	}
}

// Exemplo de uso:
// const logger = new Logger('MeuServico');
// logger.info('Serviço iniciado.');
// logger.error('Ocorreu um erro!', new Error('Algo deu errado.'));
