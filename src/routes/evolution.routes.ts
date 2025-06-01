// backend-integrador/src/routes/evolution.routes.ts
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { type Request, type Response, Router } from "express";
import { authenticate } from "../middlewares/auth";
import type { AuthRequest } from "../types";
import AppLogger from "../utils/logger"; // Assumindo que Logger está em "../utils/logger"


// Crie uma instância do logger para este módulo/contexto
const logger = new AppLogger('EvolutionRoutes');

const router = Router();
const prisma = new PrismaClient();


const API_URL = process.env.EVOLUTION_API_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";


// Função para verificar acesso à instância
async function checkInstanceAccess(req: AuthRequest, instanceName: string) {
 const userId = req.user?.id;


 if (!userId) {
  return null;
 }


 const instance = await prisma.instance.findFirst({
  where: {
   name: instanceName,
   userId: userId,
  },
 });


 return instance;
}


// Aplicar autenticação a todas as rotas
router.use(authenticate);


// Buscar instâncias com dados completos
router.get("/instances", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;


  if (!userId) {
   return res.status(401).json({ error: "Unauthorized" });
  }


  const userInstances = await prisma.instance.findMany({
   where: { userId },
   orderBy: { createdAt: "desc" },
  });


  // Buscar dados completos da API para cada instância
  const instancesWithDetails = await Promise.all(
   userInstances.map(async (instance) => {
    try {
     logger.info(`🔍 Fetching details for instance: ${instance.name}`); // Use a instância logger


     const response = await axios.get(
      `${API_URL}/instance/fetchInstances`,
      {
       headers: { apikey: API_KEY },
       params: {
        instanceName: instance.name,
       },
      },
     );


     const apiData = response.data;
     let instanceData = null;


     if (Array.isArray(apiData) && apiData.length > 0) {
      instanceData = apiData[0]; // Pegar primeiro item do array
     } else if (!Array.isArray(apiData)) {
      instanceData = apiData;
     }


     if (instanceData) {
      // Atualizar dados no banco local
      const updatedInstance = await prisma.instance.update({
       where: { id: instance.id },
       data: {
        status:
         instanceData.connectionStatus ||
         instanceData.state ||
         "close",
        profileName: instanceData.profileName || null,
        profilePictureUrl: instanceData.profilePicUrl || null,
        ownerJid: instanceData.ownerJid || null,
        lastSeen: new Date(),
       },
      });


      return {
       ...updatedInstance,
       // Garantir compatibilidade com diferentes nomes de campo
       profileName: instanceData.profileName || instance.name,
       profilePicUrl: instanceData.profilePicUrl,
       profilePictureUrl: instanceData.profilePicUrl,
       connectionStatus:
        instanceData.connectionStatus || instanceData.state || "close",
       status:
        instanceData.connectionStatus || instanceData.state || "close",
       ownerJid: instanceData.ownerJid,
       // Incluir dados adicionais se disponíveis
       integration: instance.integration,
       _count: instanceData._count,
      };
     } else {
      logger.warn(`⚠️ No API data found for instance: ${instance.name}`, undefined); // Use a instância logger
      return {
       ...instance,
       connectionStatus: "unknown",
       status: "unknown",
       profilePictureUrl: null,
       profilePicUrl: null,
      };
     }
    } catch (error) {
     logger.error( // Use a instância logger
      `❌ Error fetching details for ${instance.name}:`,
      error,
     );
     return {
      ...instance,
      connectionStatus: "error",
      status: "error",
      profilePictureUrl: null,
      profilePicUrl: null,
     };
    }
   }),
  );


  logger.info( // Use a instância logger
   `✅ Returning ${instancesWithDetails.length} instances with details`,
  );
  res.json(instancesWithDetails);
 } catch (error) {
  logger.error("❌ Error fetching instances:", error); // Use a instância logger
  res.status(500).json({ error: "Internal server error" });
 }
});


// Conectar instância (gerar QR code)
router.get("/connect/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { number } = req.query;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🔌 Connecting instance: ${instanceName}`); // Use a instância logger


  const params = new URLSearchParams();
  if (number) params.append("number", number as string);


  const response = await axios.get(
   `${API_URL}/instance/connect/${instanceName}?${params.toString()}`,
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Connect response for ${instanceName}:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error connecting ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to connect instance",
  });
 }
});


// Status da conexão
router.get(
 "/connectionState/:instanceName",
 async (req: Request, res: Response) => {
  try {
   const authReq = req as AuthRequest;
   const { instanceName } = req.params;


   const instance = await checkInstanceAccess(authReq, instanceName);
   if (!instance) {
    return res
     .status(404)
     .json({ error: "Instance not found or access denied" });
   }


   logger.info(`🔍 Getting connection state for: ${instanceName}`); // Use a instância logger


   const response = await axios.get(
    `${API_URL}/instance/connectionState/${instanceName}`,
    {
     headers: { apikey: API_KEY },
    },
   );


   logger.info(`📊 Connection state response:`, response.data); // Use a instância logger


   // Processar resposta para garantir formato consistente
   const data: any = response.data;
   const state = data?.instance?.state || data?.state || "unknown";


   res.json({
    state: state,
    connectionStatus: state,
    instance: {
     ...data?.instance,
     instanceName,
     state: state,
     profilePictureUrl:
      data?.instance?.profilePictureUrl || data?.profilePictureUrl,
     profileName: data?.instance?.profileName || data?.profileName,
     ownerJid: data?.instance?.ownerJid || data?.ownerJid,
    },
   });
  } catch (error: any) {
   const { instanceName } = req.params; // Movido para dentro do catch
   logger.error( // Use a instância logger
    `❌ Error getting connection state for ${instanceName}:`,
    error,
   );
   res.json({
    state: "error",
    connectionStatus: "error",
    instance: { instanceName, state: "error" },
   });
  }
 },
);


// Reiniciar instância
router.post("/restart/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🔄 Restarting instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/instance/restart/${instanceName}`,
   {}, // Body vazio para POST
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Restart response for ${instanceName}:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error restarting ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to restart instance",
  });
 }
});


// Fazer logout da instância
router.delete("/logout/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🚪 Logging out instance: ${instanceName}`); // Use a instância logger


  const response = await axios.delete(
   `${API_URL}/instance/logout/${instanceName}`,
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Logout response for ${instanceName}:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error logging out ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to logout instance",
  });
 }
});


// Deletar instância
router.delete("/delete/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🗑️ Deleting instance: ${instanceName}`); // Use a instância logger


  // Chamar a API Evolution para deletar a instância
  const apiResponse = await axios.delete(
   `${API_URL}/instance/delete/${instanceName}`,
   {
    headers: { apikey: API_KEY },
   },
  );


  // Se a API deletou com sucesso, deletar do banco local
  await prisma.instance.delete({
   where: { id: instance.id },
  });


  logger.info(`✅ Instance ${instanceName} deleted from API and DB.`); // Use a instância logger
  res.json({ message: "Instance deleted successfully", apiResponse: apiResponse.data });
 } catch (error: any) {
  logger.error(`❌ Error deleting ${req.params.instanceName}:`, error); // Use a instância logger
  // Se o erro for por a instância não existir na API, ainda tentamos remover do DB
  if (error.response?.status === 404) {
   try {
    const authReq = req as AuthRequest;
    const instance = await prisma.instance.findFirst({
     where: { name: req.params.instanceName, userId: authReq.user?.id },
    });
    if (instance) {
     await prisma.instance.delete({ where: { id: instance.id } });
     logger.warn(`⚠️ Instance ${req.params.instanceName} not found in API, but deleted from DB.`, undefined); // Use a instância logger
     return res.json({ message: "Instance not found in API, but deleted from DB.", apiResponse: null });
    }
   } catch (dbError) {
    logger.error(`❌ Error deleting instance ${req.params.instanceName} from DB after API 404:`, dbError); // Use a instância logger
   }
   return res.status(404).json({ error: "Instance not found in API", details: error.response?.data });
  }
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to delete instance",
  });
 }
});


// Criar nova instância
router.post("/create", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  const { instanceName, integration, qrcode, webhook } = req.body;


  if (!userId) {
   return res.status(401).json({ error: "Unauthorized" });
  }


  if (!instanceName) {
   return res.status(400).json({ error: "Instance name is required" });
  }


  // Verificar se o usuário já possui uma instância com este nome
  const existingInstance = await prisma.instance.findFirst({
   where: {
    name: instanceName,
    userId: userId,
   },
  });


  if (existingInstance) {
   return res.status(409).json({ error: "Instance name already exists for this user" });
  }


  logger.info(`✨ Creating new instance: ${instanceName} for user ${userId}`); // Use a instância logger


  // Chamar a API Evolution para criar a instância
  const apiResponse = await axios.post(
   `${API_URL}/instance/create`,
   {
    instanceName,
    integration: integration || "WHATSAPP-BAILEYS", // Default integration
    qrcode: qrcode !== undefined ? qrcode : true, // Default qrcode true
    webhook: webhook, // Pass webhook config if provided
   },
   {
    headers: { apikey: API_KEY },
   },
  );


  // Salvar a nova instância no banco de dados local
  const newInstance = await prisma.instance.create({
   data: {
    name: instanceName,
    userId: userId,
    integration: integration || "WHATSAPP-BAILEYS",
    status: (apiResponse.data && (apiResponse.data as any).instance?.state) || "creating", // Use status da API ou default
    evolutionApiId: (apiResponse.data && ((apiResponse.data as any).instance?.id || (apiResponse.data as any).instance?.evolutionApiId)) || "", // Adicione o campo obrigatório
    // Outros campos podem ser atualizados posteriormente ao buscar detalhes
   },
  });


  logger.info(`✅ Instance created:`, newInstance); // Use a instância logger
  res.status(201).json(newInstance);
 } catch (error: any) {
  logger.error("❌ Error creating instance:", error); // Use a instância logger


  // Verificar se o erro é devido à instância já existir na API
  if (error.response?.status === 409) {
   return res.status(409).json({ error: "Instance name already exists in Evolution API", details: error.response?.data });
  }


  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to create instance",
  });
 }
});


// Rotas de envio de mensagens (texto, mídia, lista, botão)
// Verifique se a instância pertence ao usuário antes de enviar
router.post("/sendText/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { number, text } = req.body;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!number || !text) {
   return res.status(400).json({ error: "Recipient number and text are required" });
  }


  logger.info(`✉️ Sending text message via ${instanceName} to ${number}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/message/sendText/${instanceName}`,
   {
    number,
    text,
   },
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Send text response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error sending text via ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to send text message",
  });
 }
});


router.post("/sendMedia/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { number, url, caption, type } = req.body; // Adicione 'type' para o tipo de mídia


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!number || !url || !type) {
   return res
    .status(400)
    .json({ error: "Recipient number, media URL, and type are required" });
  }


  logger.info(`🖼️ Sending ${type} media via ${instanceName} to ${number}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/message/sendMedia/${instanceName}`,
   {
    number,
    url, // URL ou base64 da mídia
    caption, // Legenda (opcional)
    type, // image, video, audio, document, sticker
   },
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Send media response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error sending media via ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to send media message",
  });
 }
});


router.post("/sendList/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { number, title, description, buttonText, footerText, sections } = req.body;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!number || !title || !description || !buttonText || !sections || sections.length === 0) {
   return res.status(400).json({ error: "Required fields for list message are missing" });
  }


  logger.info(`📋 Sending list message via ${instanceName} to ${number}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/message/sendList/${instanceName}`,
   {
    number,
    title,
    description,
    buttonText,
    footerText,
    sections,
   },
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Send list response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error sending list via ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to send list message",
  });
 }
});


router.post("/sendButtons/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { number, title, description, footer, buttons } = req.body;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!number || !title || !description || !buttons || buttons.length === 0) {
   return res.status(400).json({ error: "Required fields for button message are missing" });
  }


  logger.info(`🔘 Sending button message via ${instanceName} to ${number}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/message/sendButtons/${instanceName}`,
   {
    number,
    title,
    description,
    footer,
    buttons,
   },
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Send buttons response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error sending buttons via ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to send button message",
  });
 }
});


// Rotas de busca (chats, mensagens, contatos, foto de perfil)
router.post("/findChats/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`📚 Finding chats for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/chat/findChats/${instanceName}`,
   req.body, // Passa o corpo da requisição (opções de filtro, paginação)
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Find chats response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error finding chats for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to find chats",
  });
 }
});


router.post("/findMessages/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`💬 Finding messages for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/chat/findMessages/${instanceName}`,
   req.body, // Passa o corpo da requisição (opções de filtro, paginação)
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Find messages response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error finding messages for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to find messages",
  });
 }
});


router.post(
 "/fetchProfilePictureUrl/:instanceName",
 async (req: Request, res: Response) => {
  try {
   const authReq = req as AuthRequest;
   const { instanceName } = req.params;
   const { number } = req.body;


   const instance = await checkInstanceAccess(authReq, instanceName);
   if (!instance) {
    return res
     .status(404)
     .json({ error: "Instance not found or access denied" });
   }


   if (!number) {
    return res.status(400).json({ error: "Recipient number is required" });
   }


   logger.info(`📸 Fetching profile picture for ${number} via ${instanceName}`); // Use a instância logger


   const response = await axios.post(
    `${API_URL}/chat/fetchProfilePictureUrl/${instanceName}`,
    { number },
    {
     headers: { apikey: API_KEY },
    },
   );


   logger.info(`✅ Fetch profile picture response:`, response.data); // Use a instância logger
   res.json(response.data);
  } catch (error: any) {
   logger.error(`❌ Error fetching profile picture via ${req.params.instanceName}:`, error); // Use a instância logger
   res.status(error.response?.status || 500).json({
    error:
     error.response?.data?.message || "Failed to fetch profile picture",
   });
  }
 },
);


router.post("/findContacts/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`👥 Finding contacts for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/chat/findContacts/${instanceName}`,
   req.body, // Passa o corpo da requisição (opções de filtro)
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Find contacts response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error finding contacts for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to find contacts",
  });
 }
});


// Rotas de Webhook e Settings
router.post("/webhook/set/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const { webhook } = req.body;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!webhook || typeof webhook !== 'object') {
   return res.status(400).json({ error: "Webhook configuration is required" });
  }


  logger.info(`🔗 Setting webhook for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/webhook/set/${instanceName}`,
   { webhook },
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Set webhook response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error setting webhook for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to set webhook",
  });
 }
});


router.get("/webhook/find/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🔍 Finding webhook for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.get(
   `${API_URL}/webhook/find/${instanceName}`,
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Find webhook response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error finding webhook for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to find webhook",
  });
 }
});


router.post("/settings/set/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;
  const settings = req.body; // O corpo da requisição deve conter as configurações


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) {
   return res.status(400).json({ error: "Settings object is required" });
  }


  logger.info(`⚙️ Setting settings for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.post(
   `${API_URL}/settings/set/${instanceName}`,
   settings, // Passa o objeto de configurações diretamente
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Set settings response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error setting settings for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to set settings",
  });
 }
});


router.get("/settings/find/:instanceName", async (req: Request, res: Response) => {
 try {
  const authReq = req as AuthRequest;
  const { instanceName } = req.params;


  const instance = await checkInstanceAccess(authReq, instanceName);
  if (!instance) {
   return res
    .status(404)
    .json({ error: "Instance not found or access denied" });
  }


  logger.info(`🔍 Finding settings for instance: ${instanceName}`); // Use a instância logger


  const response = await axios.get(
   `${API_URL}/settings/find/${instanceName}`,
   {
    headers: { apikey: API_KEY },
   },
  );


  logger.info(`✅ Find settings response:`, response.data); // Use a instância logger
  res.json(response.data);
 } catch (error: any) {
  logger.error(`❌ Error finding settings for ${req.params.instanceName}:`, error); // Use a instância logger
  res.status(error.response?.status || 500).json({
   error: error.response?.data?.message || "Failed to find settings",
  });
 }
});


export default router;
