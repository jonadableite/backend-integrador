/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Instance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[instanceId]` on the table `Instance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[apiKey]` on the table `Instance` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Instance" ADD COLUMN     "apiKey" TEXT,
ADD COLUMN     "instanceId" TEXT,
ADD COLUMN     "integration" TEXT NOT NULL DEFAULT 'WHATSAPP-BAILEYS',
ADD COLUMN     "lastSeen" TIMESTAMP(3),
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "ownerJid" TEXT,
ADD COLUMN     "profileName" TEXT,
ADD COLUMN     "profilePictureUrl" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "Instance_name_key" ON "Instance"("name");

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
