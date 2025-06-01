// src/queue.ts
import { Queue } from 'bullmq';
import { ConfigService } from './config/env.config';
import AppLogger from './utils/logger';

const configService = ConfigService.getInstance();
const queueLogger = new AppLogger("CampaignQueue");

// Configuração da conexão com o Redis
const connection = {
  host: configService.redis.host,
  port: configService.redis.port,
  password: configService.redis.password,
};

// Criação da fila
export const campaignMessageQueue = new Queue('campaign-message-queue', { connection });

queueLogger.info("Fila de campanhas inicializada.");

// Opcional: Adicionar manipuladores de eventos para a fila
campaignMessageQueue.on('error', (err) => {
  queueLogger.error('Erro na fila de campanhas:', err);
});

