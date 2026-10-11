-- CreateEnum
CREATE TYPE "OptInStatus" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "SenderType" ADD VALUE 'CAMPAIGN';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "optInAt" TIMESTAMP(3),
ADD COLUMN     "optInSource" TEXT,
ADD COLUMN     "optInStatus" "OptInStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "waId" TEXT;

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "OptInStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "templateName" TEXT NOT NULL,
    "templateLanguage" TEXT NOT NULL,
    "templateCategory" TEXT,
    "template" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "segmentId" TEXT,
    "audienceSize" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "error" TEXT,
    "errorCode" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "buttonAt" TIMESTAMP(3),
    "buttonText" TEXT,
    "optedOutAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentEvent_createdAt_idx" ON "ConsentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_messageId_key" ON "CampaignRecipient"("messageId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contactId_sentAt_idx" ON "CampaignRecipient"("contactId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_waId_key" ON "Contact"("waId");

-- CreateIndex
CREATE INDEX "Contact_optInStatus_idx" ON "Contact"("optInStatus");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: existing WhatsApp contacts get their waId from their conversation,
-- so imports / the opt-in API match them instead of creating duplicates.
UPDATE "Contact" c
SET "waId" = conv."externalId"
FROM "Conversation" conv
WHERE conv."contactId" = c."id" AND conv."channel" = 'WHATSAPP' AND c."waId" IS NULL;
