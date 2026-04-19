-- Hotfix para drift: migration 20260418190000 marcada como aplicada sem esta coluna em alguns bancos.
ALTER TABLE "credit_card_invoices"
ADD COLUMN IF NOT EXISTS "manual_reopened_at" TIMESTAMP(3);
