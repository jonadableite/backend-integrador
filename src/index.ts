import { PrismaClient } from "@prisma/client";
import cors from "cors";
import dotenv from "dotenv";
// src/index.ts
import express from "express";
import helmet from "helmet";

// Importar rotas
import authRoutes from "./routes/auth.routes";
import campaignRoutes from "./routes/campaign.routes";
import evoapiRoutes from "./routes/evoapi.routes";
import evolutionRoutes from "./routes/evolution.routes";
import integrationRoutes from "./routes/integration.routes";
import userRoutes from "./routes/user.routes";
import webhookRoutes from "./routes/webhook.routes";

// Configurar variáveis de ambiente
dotenv.config();

// Inicializar Prisma
const prisma = new PrismaClient();

// Configurar Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(helmet());
app.use(express.json());

// Rotas
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/evoapi", evoapiRoutes);
app.use("/api/evolution", evolutionRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/integration", integrationRoutes);
app.use("/api/campaigns", campaignRoutes);

// Rotas de compatibilidade (redirecionar algumas rotas da Evo-IA para o integrador)
app.use("/api/v1/auth", integrationRoutes);

// Rota de saúde
app.get("/health", (req, res) => {
	res.status(200).json({
		status: "ok",
		timestamp: new Date(),
		environment: process.env.NODE_ENV,
		routes: {
			evoapi: "/api/evoapi - Gestão de instâncias vinculadas",
			evolution: "/api/evolution - Operações diretas na Evolution API",
			auth: "/api/auth - Autenticação",
			integration: "/api/integration - Integração com Evo-IA",
		},
	});
});

// Iniciar servidor
app.listen(PORT, () => {
	console.log(
		`🚀 Backend Integrador running on port ${PORT} in ${process.env.NODE_ENV} mode`,
	);
	console.log(`📱 EvoAPI available at http://localhost:${PORT}/api/evoapi`);
	console.log(
		`🔗 Evolution API Proxy at http://localhost:${PORT}/api/evolution`,
	);
	console.log(
		`🔑 Integration API available at http://localhost:${PORT}/api/integration`,
	);
});

// Tratamento de erros
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("🛑 Shutting down gracefully...");
	await prisma.$disconnect();
	process.exit(0);
});
