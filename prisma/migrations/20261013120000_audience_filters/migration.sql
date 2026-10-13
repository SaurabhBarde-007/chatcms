-- Blocked contacts, and broadcast audiences as filters.
ALTER TABLE "Contact" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "blockedAt" TIMESTAMP(3);

ALTER TABLE "Campaign" ADD COLUMN "audience" JSONB;
