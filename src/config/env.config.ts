// src/config/env.config.ts
// Define a interface para a estrutura de configuração esperada
interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  LOG: {
    LEVEL: string[]; // Array de strings como 'LOG', 'INFO', 'WARN', 'ERROR', 'DEBUG', 'VERBOSE', 'DARK'
    COLOR: boolean;
  };
  EVOLUTION_API: {
    URL: string;
    KEY: string;
  };
  EVO_IA_API: {
    URL: string;
    KEY: string;
  };
  // Adicione outras configurações aqui conforme necessário
}

/**
 * Serviço para carregar e acessar variáveis de ambiente.
 * Implementa o padrão Singleton.
 */
export class ConfigService {
  private readonly envConfig: EnvConfig;
  private static instance: ConfigService;

  // Declare a propriedade redis aqui
  public readonly redis: { // Tornando pública e readonly para consistência
    host: string;
    port: number;
    password: string | undefined;
    db: number; // Adicionado db com base no padrão comum de config Redis
  };

  private constructor() {
    // Carrega as variáveis de ambiente com valores padrão ou validações
    const nodeEnv = process.env.NODE_ENV || "development";
    const port = parseInt(process.env.PORT || "3000", 10);
    const databaseUrl = process.env.DATABASE_URL || "";
    const logLevel = process.env.LOG_LEVEL || "LOG,INFO,WARN,ERROR"; // Padrão mais seguro
    const logColor = process.env.LOG_COLOR === "true"; // Assume false por padrão se não for 'true'
    const evolutionApiUrl = process.env.EVOLUTION_API_URL || "";
    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";
    const evoIaApiUrl = process.env.EVO_IA_API_URL || "";
    const evoIaApiKey = process.env.EVO_IA_API_KEY || "";

    // --- Configuração do Redis ---
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined;
    const redisPassword = process.env.REDIS_PASSWORD || undefined;
    const redisDb = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0; // Padrão DB 0

    // Validação das variáveis do Redis (essenciais para a fila)
    if (!redisHost) {
        throw new Error("Variável de ambiente REDIS_HOST não definida.");
    }
    if (redisPort === undefined || isNaN(redisPort)) {
        throw new Error(`Variável de ambiente REDIS_PORT inválida: ${process.env.REDIS_PORT}`);
    }

    // Inicializa a propriedade redis
    this.redis = {
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
    };
    // --- Fim Configuração do Redis ---


    // Valida variáveis de ambiente essenciais (que já estavam)
    if (!databaseUrl) {
      throw new Error("Variável de ambiente DATABASE_URL não definida.");
    }
    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error(
        "Variáveis de ambiente EVOLUTION_API_URL ou EVOLUTION_API_KEY não definidas.",
      );
    }
    // A validação de EVO_IA_API depende se é essencial para a aplicação.
    // Se for opcional, remova este bloco. Se for essencial, mantenha:
    if (!evoIaApiUrl || !evoIaApiKey) {
      throw new Error(
        "Variáveis de ambiente EVO_IA_API_URL ou EVO_IA_API_KEY não definidas.",
      );
    }
    if (Number.isNaN(port)) {
      throw new Error(`Variável de ambiente PORT inválida: ${process.env.PORT}`);
    }


    // Armazena a configuração validada (exceto Redis, que está em this.redis)
    this.envConfig = {
      NODE_ENV: nodeEnv,
      PORT: port,
      DATABASE_URL: databaseUrl,
      LOG: {
        // Converte a string de níveis para um array de strings em MAIÚSCULAS para consistência
        LEVEL: logLevel.toUpperCase().split(","),
        COLOR: logColor,
      },
      EVOLUTION_API: {
        URL: evolutionApiUrl,
        KEY: evolutionApiKey,
      },
      EVO_IA_API: {
        URL: evoIaApiUrl,
        KEY: evoIaApiKey,
      },
      // ...
    };

    // Opcional: Logar a configuração carregada (exceto chaves sensíveis)
    console.log("Configuração carregada (sensível omitida):", {
      NODE_ENV: this.envConfig.NODE_ENV,
      PORT: this.envConfig.PORT,
      // DATABASE_URL: '***', // Não logar
      LOG: this.envConfig.LOG,
      EVOLUTION_API: { URL: this.envConfig.EVOLUTION_API.URL, KEY: "***" }, // Não logar a chave
      EVO_IA_API: { URL: this.envConfig.EVO_IA_API.URL, KEY: "***" }, // Não logar a chave
      // Redis: { host: this.redis.host, port: this.redis.port, password: '***', db: this.redis.db }, // Não logar senha
      // ...
    });
  }

  /**
   * Garante que apenas uma instância de ConfigService seja criada.
   * @returns A instância única de ConfigService.
   */
  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Obtém um valor de configuração usando notação de ponto (ex: 'LOG.LEVEL').
   * Fornece tipagem forte para chaves conhecidas.
   * @param key A chave da configuração (ex: 'PORT', 'LOG.LEVEL').
   * @returns O valor da configuração ou undefined se a chave não for encontrada.
   */
  // Sobrecarga para chaves de nível superior
  public get<K extends keyof EnvConfig>(key: K): EnvConfig[K];
  // Sobrecarga para chaves aninhadas (até 2 níveis)
  public get<
    K extends keyof EnvConfig,
    SK extends Extract<keyof EnvConfig[K], string>,
  >(key: `${K}.${SK}`): EnvConfig[K][SK];
  // Implementação genérica
  public get(key: string): any {
    const keys = key.split(".");
    let value: any = this.envConfig; // Note que 'redis' NÃO está em envConfig agora

    // Se a chave solicitada for 'redis' ou começar com 'redis.', tratamos separadamente
    if (keys[0] === 'redis') {
        value = this.redis;
        // Remove 'redis' do array de chaves para continuar a busca dentro de this.redis
        keys.shift();
        if (keys.length === 0) {
             return value; // Retorna o objeto redis completo se a chave for apenas 'redis'
        }
    }

    for (const k of keys) {
      // Verifica se o valor atual é um objeto e se a chave existe nele
      if (
        value === null ||
        typeof value !== "object" ||
        !(k in value) ||
        value[k] === undefined
      ) {
        console.warn(`Chave de configuração "${key}" não encontrada ou inválida.`);
        return undefined;
      }
      value = value[k];
    }
    return value;
  }
}

export const configService = ConfigService.getInstance();
