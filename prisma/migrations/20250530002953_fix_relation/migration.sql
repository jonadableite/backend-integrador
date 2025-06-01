-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "evoIaUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "evolutionApiId" TEXT NOT NULL,
    "instanceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "integration" TEXT NOT NULL DEFAULT 'WHATSAPP-BAILEYS',
    "apiKey" TEXT,
    "profileName" TEXT,
    "profilePictureUrl" TEXT,
    "ownerJid" TEXT,
    "lastSeen" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "messageTextTemplate" TEXT,
    "messageMediaTemplate" JSONB,
    "messageButtons" JSONB,
    "intervalMin" INTEGER NOT NULL DEFAULT 5,
    "intervalMax" INTEGER NOT NULL DEFAULT 15,
    "useNumberRotation" BOOLEAN NOT NULL DEFAULT true,
    "instanceIds" TEXT[],
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "optedOutCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendingLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "messageContent" TEXT,
    "messagePayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'attempted',
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_evoIaUserId_key" ON "User"("evoIaUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_name_key" ON "Instance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_evolutionApiId_key" ON "Instance"("evolutionApiId");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_instanceId_key" ON "Instance"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_apiKey_key" ON "Instance"("apiKey");

-- CreateIndex
CREATE INDEX "Instance_userId_idx" ON "Instance"("userId");

-- CreateIndex
CREATE INDEX "Instance_name_idx" ON "Instance"("name");

-- CreateIndex
CREATE INDEX "Instance_status_idx" ON "Instance"("status");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Recipient_campaignId_idx" ON "Recipient"("campaignId");

-- CreateIndex
CREATE INDEX "Recipient_number_idx" ON "Recipient"("number");

-- CreateIndex
CREATE INDEX "Recipient_status_idx" ON "Recipient"("status");

-- CreateIndex
CREATE INDEX "SendingLog_campaignId_idx" ON "SendingLog"("campaignId");

-- CreateIndex
CREATE INDEX "SendingLog_recipientId_idx" ON "SendingLog"("recipientId");

-- CreateIndex
CREATE INDEX "SendingLog_instanceId_idx" ON "SendingLog"("instanceId");

-- CreateIndex
CREATE INDEX "SendingLog_status_idx" ON "SendingLog"("status");

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingLog" ADD CONSTRAINT "SendingLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingLog" ADD CONSTRAINT "SendingLog_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendingLog" ADD CONSTRAINT "SendingLog_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
