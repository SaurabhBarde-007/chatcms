-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('BROADCAST', 'API');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'LIVE';
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';

-- DropIndex
DROP INDEX "CampaignRecipient_campaignId_contactId_key";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "trigger" JSONB,
ADD COLUMN     "type" "CampaignType" NOT NULL DEFAULT 'BROADCAST';

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "amount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "providerLinkId" TEXT,
    "providerPaymentId" TEXT,
    "paymentMethod" TEXT,
    "shortUrl" TEXT,
    "sentVia" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "data" JSONB NOT NULL,
    "metaTemplateId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_campaignRecipientId_key" ON "PaymentRequest"("campaignRecipientId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_providerLinkId_key" ON "PaymentRequest"("providerLinkId");

-- CreateIndex
CREATE INDEX "PaymentRequest_status_createdAt_idx" ON "PaymentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRequest_campaignId_idx" ON "PaymentRequest"("campaignId");

-- CreateIndex
CREATE INDEX "PaymentRequest_contactId_idx" ON "PaymentRequest"("contactId");

-- CreateIndex
CREATE INDEX "TemplateDraft_metaTemplateId_idx" ON "TemplateDraft"("metaTemplateId");

-- CreateIndex
CREATE INDEX "Campaign_type_status_idx" ON "Campaign"("type", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_contactId_idx" ON "CampaignRecipient"("campaignId", "contactId");

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

