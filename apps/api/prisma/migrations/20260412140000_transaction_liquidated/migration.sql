-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "liquidated" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: confirmed rows count as liquidated for continuity with previous behavior
UPDATE "transactions" SET "liquidated" = true WHERE "status" = 'CONFIRMED';
