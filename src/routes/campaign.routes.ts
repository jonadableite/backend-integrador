// src/routes/campaign.routes.ts
import { Router } from 'express';
import { createCampaign, startCampaign } from '../controllers/campaign.controller';
// Importe seu middleware de autenticação, por exemplo:
// import { authenticateToken } from '../middleware/auth';

const router = Router();

// router.use(authenticateToken); // Aplicar autenticação a todas as rotas de campanha

router.post('/', createCampaign);
router.post('/:campaignId/start', startCampaign);
// Adicione rotas para pause, cancel, status, list, etc.

export default router;
