-- AlterTable: add installment and recurring_template fields to transactions
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "recurring_template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "installment_group_id" TEXT,
  ADD COLUMN IF NOT EXISTS "installment_index" INTEGER,
  ADD COLUMN IF NOT EXISTS "installment_count" INTEGER;

-- CreateIndex: index for invoice status lookups
CREATE INDEX IF NOT EXISTS "credit_card_invoices_status_idx" ON "credit_card_invoices"("status");
