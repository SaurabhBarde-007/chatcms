-- Remove Razorpay payments: the PaymentRequest table (and its status enum).
-- Apply AFTER the version without payments is deployed: older versions still read this table.
-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_campaignRecipientId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_contactId_fkey";

-- DropTable
DROP TABLE "PaymentRequest";

-- DropEnum
DROP TYPE "PaymentStatus";

