-- CreateEnum
CREATE TYPE "TransactionRecognition" AS ENUM ('OPERATIONAL', 'TRANSFER_LEG', 'INVOICE_PAYMENT');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "recognition" "TransactionRecognition" NOT NULL DEFAULT 'OPERATIONAL';

ALTER TABLE "transactions" ADD COLUMN "credit_card_invoice_id" TEXT;

ALTER TABLE "credit_cards" ADD COLUMN "default_account_id" TEXT;

-- Backfill: primeira conta ativa da família por cartão sem padrão
UPDATE "credit_cards" AS cc
SET "default_account_id" = sub."id"
FROM (
  SELECT DISTINCT ON ("family_id") "family_id", "id"
  FROM "accounts"
  WHERE "is_active" = true
  ORDER BY "family_id", "created_at" ASC
) AS sub
WHERE cc."family_id" = sub."family_id" AND cc."default_account_id" IS NULL;

-- CreateIndex
CREATE INDEX "transactions_credit_card_invoice_id_idx" ON "transactions"("credit_card_invoice_id");

CREATE INDEX "credit_cards_default_account_id_idx" ON "credit_cards"("default_account_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_invoice_id_fkey" FOREIGN KEY ("credit_card_invoice_id") REFERENCES "credit_card_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: transfer legs
UPDATE "transactions" SET "recognition" = 'TRANSFER_LEG' WHERE "transfer_id" IS NOT NULL;

-- Backfill: legacy invoice payments (pre-recognition column)
UPDATE "transactions"
SET "recognition" = 'INVOICE_PAYMENT'
WHERE "transfer_id" IS NULL
  AND "credit_card_id" IS NULL
  AND "type" = 'EXPENSE'
  AND "status" = 'CONFIRMED'
  AND "description" LIKE 'Pagamento fatura%';
