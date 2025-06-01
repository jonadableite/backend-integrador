// src/services/sendMessage.service.ts
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import path from 'node:path'; // Importe path se for lidar com nomes de arquivo
import { configService } from '../config/env.config';
import { Logger } from '../utils/logger';

const apiLogger = new Logger("EvolutionAPI");

// --- Interfaces para Tipagem ---

// Estrutura esperada para a opção 'quoted'
interface QuotedMessage {
  key?: {
    id: string; // ID da mensagem citada
    pushName?: string; // Nome do remetente (opcional)
    remoteJid?: string; // numero de telefone (JID)
    fromMe?: boolean; // Se a mensagem citada foi enviada por você
  };
  message?: any; // Opcional: Payload completo da mensagem citada (menos comum, usar key.id é preferível)
  // Adicione outras propriedades da estrutura quoted conforme necessário
}

// Opções comuns para envio de mensagem
interface CommonMessageOptions {
  delay?: number; // Atraso em ms antes de enviar a mensagem
  quoted?: QuotedMessage; // Mensagem a ser citada
  mentionsEveryOne?: boolean; // Mencionar todos em um grupo
  mentioned?: string[]; // Lista de números (JIDs) a serem mencionados
  // Adicione outras opções comuns aqui
}

// Payload para sendText
interface SendTextPayload extends CommonMessageOptions {
  number: string; // Número do destinatário (com código do país, ex: 5511987654321)
  text: string;
  linkPreview?: boolean; // Opção específica para sendText
}

// Payload para sendMedia (assumindo a estrutura do seu código original e docs)
interface SendMediaPayload extends CommonMessageOptions {
  number: string; // Número do destinatário
  mediaMessage: {
    url?: string; // URL da mídia (se não for base64)
    base64?: string; // Base64 da mídia (se não for URL)
    mimetype?: string; // Tipo MIME da mídia (pode ser inferido pela URL/base64, mas bom explicitar)
    caption?: string; // Legenda para imagem/vídeo/documento
    fileName?: string; // Nome do arquivo para documento
  };
  // Outras opções específicas para sendMedia, se houver
}

// Payload para sendWhatsAppAudio (áudio narrado/VOIP)
interface SendWhatsAppAudioPayload extends CommonMessageOptions {
  number: string; // Número do destinatário
  audio: string; // URL ou base64 do áudio (espera OGG/VOIP)
  encoding?: boolean; // Se true, a API tentará re-encodar o áudio para o formato correto
}

// Payload para sendButtons
interface SendButtonsPayload extends CommonMessageOptions {
    number: string;
    title: string;
    description: string;
    footer: string;
    buttons: Array<{ type: 'reply' | 'copy' | 'url' | 'call' | 'pix', [key: string]: any }>; // Tipagem simplificada dos botões
}

// Payload para sendList
interface SendListPayload extends CommonMessageOptions {
    number: string;
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: Array<{
        title: string;
        rows: Array<{
            title: string;
            description?: string;
            rowId: string;
        }>;
    }>;
}


// Estrutura esperada da resposta de sucesso da API Evolution para envio
interface SendMessageResponse {
    key?: { // Pode conter o ID da mensagem enviada
        remoteJid: string;
        fromMe: boolean;
        id: string; // O ID da mensagem
        _serialized: string;
    };
    status?: number; // Alguns endpoints retornam status HTTP no body
    message?: string; // Mensagem de sucesso ou erro no body
    // Outras propriedades da resposta
    [key: string]: any; // Permite outras propriedades não tipadas explicitamente
}

// Resultado padronizado para os métodos de envio
interface SendResult {
    success: boolean;
    messageId?: string; // ID da mensagem enviada, se sucesso
    error?: string; // Mensagem de erro, se falha
    details?: any; // Detalhes adicionais da resposta da API ou erro
}


/**
 * Serviço para interagir com a Evolution API para envio de mensagens.
 * Utiliza a configuração da ConfigService e o logger.
 */
export class EvolutionAPIService {
  private readonly axiosInstance: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    const evolutionConfig = configService.get('EVOLUTION_API');
    if (!evolutionConfig || !evolutionConfig.URL || !evolutionConfig.KEY) {
      apiLogger.error("Configuração da Evolution API não encontrada ou incompleta.");
      throw new Error("Configuração da Evolution API não encontrada ou incompleta.");
    }

    this.axiosInstance = axios.create({
      baseURL: evolutionConfig.URL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionConfig.KEY, // Chave de API no header
      },
      timeout: 30000, // Timeout de 30 segundos para as requisições
    });

    this.apiKey = evolutionConfig.KEY;

    // Opcional: Interceptadores para logar requisições e respostas
    this.axiosInstance.interceptors.request.use((request: { method: any; url: any; data: any; headers: any; }) => {
        apiLogger.debug(`[Evolution API Request] ${request.method} ${request.url}`, { data: request.data, headers: request.headers });
        return request;
    }, (error: any) => {
        apiLogger.error("[Evolution API Request Error]", error);
        return Promise.reject(error);
    });

    this.axiosInstance.interceptors.response.use((response: { config: { method: any; url: any; }; status: any; data: any; }) => {
         apiLogger.debug(`[Evolution API Response] ${response.config.method} ${response.config.url} Status: ${response.status}`, { data: response.data });
         return response;
    }, (error: { config: { method: any; url: any; }; response: { status: any; data: any; }; message: any; }) => {
        apiLogger.error(`[Evolution API Response Error] ${error.config?.method} ${error.config?.url} Status: ${error.response?.status}`, error.response?.data || error.message);
        return Promise.reject(error);
    });
  }

  /**
   * Extrai o ID da mensagem da resposta da API Evolution.
   * A estrutura da resposta pode variar ligeiramente entre endpoints.
   * @param responseData Os dados da resposta da API.
   * @returns O ID da mensagem ou undefined se não encontrado.
   */
  private extractMessageId(responseData: SendMessageResponse): string | undefined {
      // Verifica se o ID está diretamente em responseData.id (menos comum)
      if (responseData.id) {
          return responseData.id;
      }
      // Verifica a estrutura aninhada comum em 'key'
      if (responseData.key?.id) {
          return responseData.key.id;
      }
      // Adicione outras verificações se a API tiver formatos de resposta diferentes
      return undefined;
  }


  /**
   * Envia uma mensagem de texto simples.
   * Baseado na documentação 'Send Text'.
   * @param params Parâmetros para o envio.
   * @returns Um objeto SendResult indicando sucesso/falha e detalhes.
   */
  async sendText(params: {
      instanceName: string;
      number: string;
      text: string;
      options?: CommonMessageOptions & { linkPreview?: boolean }; // Combina opções comuns com específicas
  }): Promise<SendResult> {
      try {
          const { instanceName, number, text, options } = params;
          const endpoint = `/message/sendText/${instanceName}`;
          const payload: SendTextPayload = {
              number,
              text,
              ...options, // Inclui opções comuns e linkPreview
          };
          apiLogger.info(`Tentando enviar texto para ${number} na instância ${instanceName}...`);
          const response = await this.axiosInstance.post<SendMessageResponse>(endpoint, payload);

          // Verifica o status HTTP e o status/ID no corpo da resposta
          if (response.status >= 200 && response.status < 300) {
             const messageId = this.extractMessageId(response.data);
             const apiStatus = response.data?.status; // Alguns endpoints retornam status no body

             // Considera sucesso se encontrar um messageId OU se o status no body for sucesso
             if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                apiLogger.info(`Texto enviado com sucesso para ${number} na instância ${instanceName}. MessageId: ${messageId}`);
                return {
                  success: true,
                  messageId: messageId,
                  details: response.data,
                };
             } else {
                 // Resposta HTTP 2xx, mas o corpo indica falha
                 const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                 apiLogger.warn(`Falha no envio de texto (Resposta API): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                 return {
                    success: false,
                    error: errorMessage,
                    details: response.data,
                 };
             }
          } else {
             // Status HTTP de erro
             const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
             apiLogger.error(`Falha no envio de texto (Status HTTP): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
             return {
               success: false,
               error: errorMessage,
               details: response.data,
             };
          }
      } catch (error: any) {
          // Erros de rede, timeout, etc.
          apiLogger.error(`Exceção ao enviar texto para ${params.number} na instância ${params.instanceName}:`, error);
          return {
              success: false,
              error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
              details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
          };
      }
  }

  /**
   * Envia um arquivo de mídia (imagem, vídeo, documento, áudio genérico).
   * Baseado na documentação 'Send Media File'.
   * @param params Parâmetros para o envio.
   * @returns Um objeto SendResult indicando sucesso/falha e detalhes.
   */
  async sendMedia(params: {
      instanceName: string;
      number: string;
      media: {
          url?: string; // URL da mídia
          base64?: string; // Base64 da mídia
          mimetype?: string; // Tipo MIME (obrigatório se base64)
          caption?: string; // Legenda
          fileName?: string; // Nome do arquivo (recomendado para documentos)
      };
      options?: CommonMessageOptions;
  }): Promise<SendResult> {
      try {
          const { instanceName, number, media, options } = params;
          const endpoint = `/message/sendMedia/${instanceName}`;

          // Validação básica
          if (!media.url && !media.base64) {
              return { success: false, error: "URL ou Base64 da mídia deve ser fornecido." };
          }
          if (media.base64 && !media.mimetype) {
               apiLogger.warn(`Enviando mídia via base64 sem mimetype especificado para ${number}. A API pode falhar.`, undefined);
              // return { success: false, error: "Mimetype é obrigatório ao enviar mídia via Base64." };
          }

          const payload: SendMediaPayload = {
              number,
              mediaMessage: {
                  url: media.url,
                  base64: media.base64,
                  mimetype: media.mimetype,
                  caption: media.caption,
                  fileName: media.fileName || (media.url ? path.basename(media.url) : undefined), // Tenta inferir nome do arquivo da URL
              },
              ...options,
          };
          apiLogger.info(`Tentando enviar mídia (${media.url ? media.url : 'base64'}) para ${number} na instância ${instanceName}...`);
          const response = await this.axiosInstance.post<SendMessageResponse>(endpoint, payload);

           if (response.status >= 200 && response.status < 300) {
             const messageId = this.extractMessageId(response.data);
             const apiStatus = response.data?.status;
             if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                apiLogger.info(`Mídia enviada com sucesso para ${number} na instância ${instanceName}. MessageId: ${messageId}`);
                return {
                  success: true,
                  messageId: messageId,
                  details: response.data,
                };
             } else {
                 const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                 apiLogger.warn(`Falha no envio de mídia (Resposta API): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                 return {
                    success: false,
                    error: errorMessage,
                    details: response.data,
                 };
             }
          } else {
             const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
             apiLogger.error(`Falha no envio de mídia (Status HTTP): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
             return {
               success: false,
               error: errorMessage,
               details: response.data,
             };
          }
      } catch (error: any) {
          apiLogger.error(`Exceção ao enviar mídia para ${params.number} na instância ${params.instanceName}:`, error);
          return {
              success: false,
              error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
              details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
          };
      }
  }

  /**
   * Envia um áudio no formato OGG/VOIP (áudio narrado).
   * Baseado na documentação 'Send Narrated Audio'.
   * @param params Parâmetros para o envio.
   * @returns Um objeto SendResult indicando sucesso/falha e detalhes.
   */
  async sendWhatsAppAudio(params: {
      instanceName: string;
      number: string;
      audio: string; // URL ou base64 do áudio OGG/VOIP
      options?: CommonMessageOptions & { encoding?: boolean }; // Combina opções comuns com encoding
  }): Promise<SendResult> {
      try {
          const { instanceName, number, audio, options } = params;
          const endpoint = `/message/sendWhatsAppAudio/${instanceName}`;
          const payload: SendWhatsAppAudioPayload = {
              number,
              audio,
              ...options, // Inclui opções comuns e encoding
          };
          apiLogger.info(`Tentando enviar áudio narrado para ${number} na instância ${instanceName}...`);
          const response = await this.axiosInstance.post<SendMessageResponse>(endpoint, payload);

           if (response.status >= 200 && response.status < 300) {
             const messageId = this.extractMessageId(response.data);
             const apiStatus = response.data?.status;
             if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                apiLogger.info(`Áudio narrado enviado com sucesso para ${number} na instância ${instanceName}. MessageId: ${messageId}`);
                return {
                  success: true,
                  messageId: messageId,
                  details: response.data,
                };
             } else {
                 const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                 apiLogger.warn(`Falha no envio de áudio narrado (Resposta API): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                 return {
                    success: false,
                    error: errorMessage,
                    details: response.data,
                 };
             }
          } else {
             const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
             apiLogger.error(`Falha no envio de áudio narrado (Status HTTP): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
             return {
               success: false,
               error: errorMessage,
               details: response.data,
             };
          }
      } catch (error: any) {
        // CORRIGIDO: Erro de sintaxe removido aqui
        apiLogger.error(`Exceção ao enviar áudio narrado para ${params.number} na instância ${params.instanceName}:`, error);
        return {
          success: false,
          error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
          details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
        };
      }
  }

  // --- Métodos Adicionais (Exemplos baseados na documentação fornecida) ---

  /**
   * Envia uma mensagem de botão.
   * Baseado na documentação 'Send Button'.
   * @param params Parâmetros para o envio.
   * @returns Um objeto SendResult indicando sucesso/falha e detalhes.
   */
  async sendButtons(params: {
      instanceName: string;
      number: string;
      title: string;
      description: string;
      footer: string;
      buttons: Array<{ type: 'reply' | 'copy' | 'url' | 'call' | 'pix', [key: string]: any }>; // Simplificado, idealmente tipar cada tipo de botão
      options?: CommonMessageOptions;
  }): Promise<SendResult> {
      try {
          const { instanceName, number, title, description, footer, buttons, options } = params;
          const endpoint = `/message/sendButtons/${instanceName}`;
          const payload: SendButtonsPayload = {
              number,
              title,
              description,
              footer,
              buttons,
              ...options,
          };
          apiLogger.info(`Tentando enviar botões para ${number} na instância ${instanceName}...`);
          const response = await this.axiosInstance.post<SendMessageResponse>(endpoint, payload);

           if (response.status >= 200 && response.status < 300) {
             const messageId = this.extractMessageId(response.data);
             const apiStatus = response.data?.status;
             if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                apiLogger.info(`Botões enviados com sucesso para ${number} na instância ${instanceName}. MessageId: ${messageId}`);
                return {
                  success: true,
                  messageId: messageId,
                  details: response.data,
                };
             } else {
                 const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                 apiLogger.warn(`Falha no envio de botões (Resposta API): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                 return {
                    success: false,
                    error: errorMessage,
                    details: response.data,
                 };
             }
          } else {
             const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
             apiLogger.error(`Falha no envio de botões (Status HTTP): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
             return {
               success: false,
               error: errorMessage,
               details: response.data,
             };
          }
      } catch (error: any) {
          apiLogger.error(`Exceção ao enviar botões para ${params.number} na instância ${params.instanceName}:`, error);
          return {
              success: false,
              error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
              details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
          };
      }
  }

   /**
   * Envia uma mensagem de lista.
   * Baseado na documentação 'Send List'.
   * @param params Parâmetros para o envio.
   * @returns Um objeto SendResult indicando sucesso/falha e detalhes.
   */
  async sendList(params: {
      instanceName: string;
      number: string;
      title: string;
      description: string;
      buttonText: string;
      footerText?: string;
      sections: Array<{
          title: string;
          rows: Array<{
              title: string;
              description?: string;
              rowId: string;
          }>;
      }>;
      options?: CommonMessageOptions;
  }): Promise<SendResult> {
      try {
          const { instanceName, number, title, description, buttonText, footerText, sections, options } = params;
          const endpoint = `/message/sendList/${instanceName}`;
          const payload: SendListPayload = {
              number,
              title,
              description,
              buttonText,
              footerText,
              sections,
              ...options,
          };
          apiLogger.info(`Tentando enviar lista para ${number} na instância ${instanceName}...`);
          const response = await this.axiosInstance.post<SendMessageResponse>(endpoint, payload);

           if (response.status >= 200 && response.status < 300) {
             const messageId = this.extractMessageId(response.data);
             const apiStatus = response.data?.status;
             if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                apiLogger.info(`Lista enviada com sucesso para ${number} na instância ${instanceName}. MessageId: ${messageId}`);
                return {
                  success: true,
                  messageId: messageId,
                  details: response.data,
                };
             } else {
                 const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                 apiLogger.warn(`Falha no envio de lista (Resposta API): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                 return {
                    success: false,
                    error: errorMessage,
                    details: response.data,
                 };
             }
          } else {
             const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
             apiLogger.error(`Falha no envio de lista (Status HTTP): ${errorMessage} para ${number} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
             return {
               success: false,
               error: errorMessage,
               details: response.data,
             };
          }
      } catch (error: any) {
          apiLogger.error(`Exceção ao enviar lista para ${params.number} na instância ${params.instanceName}:`, error);
          return {
              success: false,
              error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
              details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
          };
      }
  }
  // Adicione outros métodos de envio aqui (ex: sendLocation, sendContact, etc. conforme a documentação da Evolution API)

    /**
     * Método genérico para enviar qualquer tipo de mensagem se o endpoint e payload forem conhecidos.
     * Pode ser útil para flexibilidade, mas os métodos específicos acima oferecem melhor tipagem.
     * @param instanceName Nome da instância.
     * @param endpoint O endpoint específico (ex: '/message/sendText').
     * @param payload O corpo da requisição.
     * @returns Um objeto SendResult.
     */
    async sendGenericMessage(instanceName: string, endpoint: string, payload: any): Promise<SendResult> {
        try {
            const fullEndpoint = `${endpoint}/${instanceName}`;
            apiLogger.info(`Tentando enviar mensagem genérica para ${fullEndpoint} na instância ${instanceName}...`);
            const response = await this.axiosInstance.post<SendMessageResponse>(fullEndpoint, payload);

             if (response.status >= 200 && response.status < 300) {
                const messageId = this.extractMessageId(response.data);
                const apiStatus = response.data?.status;
                if (messageId || (apiStatus && apiStatus >= 200 && apiStatus < 300)) {
                    apiLogger.info(`Mensagem genérica enviada com sucesso para ${fullEndpoint} na instância ${instanceName}. MessageId: ${messageId}`);
                    return {
                      success: true,
                      messageId: messageId,
                      details: response.data,
                    };
                } else {
                    const errorMessage = response.data?.message || `Resposta da API indica falha (Status JSON: ${apiStatus || 'N/A'})`;
                    apiLogger.warn(`Falha no envio de mensagem genérica (Resposta API): ${errorMessage} para ${fullEndpoint} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`, undefined);
                    return {
                       success: false,
                       error: errorMessage,
                       details: response.data,
                    };
                }
             } else {
                const errorMessage = response.data?.message || `Erro na API Evolution (Status HTTP: ${response.status})`;
                apiLogger.error(`Falha no envio de mensagem genérica (Status HTTP): ${errorMessage} para ${fullEndpoint} na instância ${instanceName}. Detalhes: ${JSON.stringify(response.data)}`);
                return {
                  success: false,
                  error: errorMessage,
                  details: response.data,
                };
             }
        } catch (error: any) {
            apiLogger.error(`Exceção ao enviar mensagem genérica para ${endpoint} na instância ${instanceName}:`, error);
            return {
                success: false,
                error: error.response?.data?.message || error.message || "Erro desconhecido na requisição API",
                details: error.response?.data || (error instanceof Error ? { message: error.message, stack: error.stack } : error),
            };
        }
    }
}
