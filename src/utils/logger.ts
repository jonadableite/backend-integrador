// src/utils/logger.ts
import dayjs from "dayjs";
import fs from "node:fs";
import path from "node:path";
import { configService } from "../config/env.config";

// Helper para formatar o timestamp
const formatDateLog = (timestamp: number) =>
  dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss.SSS");

// Padroniza os níveis de log para inglês
enum LogLevel {
  LOG = "LOG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
  VERBOSE = "VERBOSE",
  DARK = "DARK",
  WEBHOOKS = "WEBHOOKS", // Adicionado WEBHOOKS
  WEBSOCKET = "WEBSOCKET", // Adicionado WEBSOCKET
}

// Mapeamento de níveis para cores ANSI
const LogLevelColor: Record<LogLevel, string> = {
  [LogLevel.LOG]: "\x1b[32m", // Verde
  [LogLevel.INFO]: "\x1b[34m", // Azul
  [LogLevel.WARN]: "\x1b[33m", // Amarelo
  [LogLevel.ERROR]: "\x1b[31m", // Vermelho
  [LogLevel.DEBUG]: "\x1b[36m", // Ciano
  [LogLevel.VERBOSE]: "\x1b[37m", // Branco (claro)
  [LogLevel.DARK]: "\x1b[90m", // Cinza escuro
  [LogLevel.WEBHOOKS]: "\x1b[35m", // Magenta para webhooks
  [LogLevel.WEBSOCKET]: "\x1b[35m", // Magenta para websockets (pode ser outra cor se preferir)
};

// Reset de cor ANSI
const COLOR_RESET = "\x1b[0m";
const COLOR_BRIGHT = "\x1b[1m";

// Tenta ler o package.json para a versão da aplicação
let packageJsonVersion = "N/A";
try {
  // Ajusta o caminho para ser relativo ao diretório de execução (geralmente a raiz do projeto)
  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    packageJsonVersion = packageJson.version || "N/A";
  } else {
    console.warn("package.json não encontrado no diretório de execução.");
  }
} catch (e: any) {
  console.warn(
    `Não foi possível ler package.json para obter a versão: ${e.message}`
  );
}

// Obtém o PID do processo
const processId = process.pid;

// Classe Logger
class AppLogger {
  private context: string;
  private logLevel: LogLevel[];
  private useColor: boolean;

  constructor(context: string) {
    this.context = context;
    // Assume que configService já foi carregado e está disponível
    this.logLevel = configService.get("LOG.LEVEL") as LogLevel[];
    this.useColor = configService.get("LOG.COLOR") as boolean;

    // Loga a versão da aplicação e o PID na inicialização do logger principal (se for o 'App')
    if (context === "App") {
      console.log(
        `App v${packageJsonVersion} PID:${processId} - ${formatDateLog(
          Date.now()
        )} [INFO] [${this.context}] Logger inicializado.`
      );
    }
  }

  // Método central para logar no console
  private console(
    level: LogLevel,
    message: any,
    ...optionalParams: any[]
  ): void {
    // Verifica se o nível de log atual está incluído nos níveis configurados
    if (!this.logLevel.includes(level)) {
      return; // Não loga se o nível não está permitido
    }

    const timestamp = formatDateLog(Date.now());
    const levelColor = this.useColor ? LogLevelColor[level] : "";
    const resetColor = this.useColor ? COLOR_RESET : "";
    const brightColor = this.useColor ? COLOR_BRIGHT : "";
    const contextColor = this.useColor ? "\x1b[35m" : ""; // Cor para o contexto

    // Formata a mensagem principal
    const formattedMessage =
      typeof message === "string"
        ? message
        : JSON.stringify(message, null, 2); // Stringify objetos ou outros tipos

    // Formata os parâmetros opcionais
    const formattedOptionalParams = optionalParams
      .map((param) =>
        typeof param === "string" ? param : JSON.stringify(param, null, 2)
      )
      .join(" "); // Junta os parâmetros opcionais com espaço

    // Monta a linha de log
    const logLine = `${timestamp} ${brightColor}[${levelColor}${level}${resetColor}${brightColor}]${resetColor} [${contextColor}${this.context}${resetColor}] ${formattedMessage}${
      formattedOptionalParams ? " " + formattedOptionalParams : ""
    }`;

    // Usa console.log, console.warn ou console.error dependendo do nível
    switch (level) {
      case LogLevel.ERROR:
        console.error(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      default:
        console.log(logLine);
        break;
    }
  }

  /** Loga uma mensagem informativa geral. */
  public log(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.LOG, message, ...optionalParams);
  }

  /** Loga informações importantes sobre o fluxo da aplicação. */
  public info(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.INFO, message, ...optionalParams);
  }

  /** Loga avisos sobre situações que podem requerer atenção, mas não são erros. */
  // Corrigido para aceitar optionalParams
  public warn(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.WARN, message, ...optionalParams);
  }

  /** Loga mensagens de erro e detalhes de exceções. */
  // Mantido como estava, aceitando um erro opcional como segundo argumento
  public error(message: any, error?: any, ...optionalParams: any[]): void {
    if (error instanceof Error) {
      this.console(LogLevel.ERROR, message, error.stack || error.message, ...optionalParams);
    } else if (error !== undefined) {
      this.console(LogLevel.ERROR, message, error, ...optionalParams);
    } else {
      this.console(LogLevel.ERROR, message, ...optionalParams);
    }
  }

  /** Loga informações detalhadas, úteis para depuração em ambientes de desenvolvimento. */
  // Corrigido para aceitar optionalParams
  public debug(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.DEBUG, message, ...optionalParams);
  }

  /** Loga informações muito detalhadas, para rastreamento profundo. */
  // Corrigido para aceitar optionalParams
  public verbose(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.VERBOSE, message, ...optionalParams);
  }

  /** Loga mensagens com cor escura, útil para logs de baixo nível ou menos importantes. */
  // Corrigido para aceitar optionalParams
  public dark(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.DARK, message, ...optionalParams);
  }

  /** Loga eventos de webhook. */
  public webhook(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.WEBHOOKS, message, ...optionalParams);
  }

  /** Loga eventos de websocket. */
  public websocket(message: any, ...optionalParams: any[]): void {
    this.console(LogLevel.WEBSOCKET, message, ...optionalParams);
  }

  // Mantém o método 'depurar' por compatibilidade, mas mapeia para 'debug'
  public depurar(message: any, ...optionalParams: any[]): void {
    this.debug(message, ...optionalParams);
  }
}

// Cria uma instância do logger principal
export const appLogger = new AppLogger("App");

// Cria loggers específicos para contextos comuns
export const campaignLogger = new AppLogger("CampaignQueue");
export const webhookLogger = new AppLogger("WebhookController");
export const apiLogger = new AppLogger("ApiController");
export const dbLogger = new AppLogger("Database");
export const serviceLogger = new AppLogger("Service");
export const websocketLogger = new AppLogger("Websocket");

// Exporta a classe para permitir a criação de loggers com contextos personalizados
export default AppLogger;

