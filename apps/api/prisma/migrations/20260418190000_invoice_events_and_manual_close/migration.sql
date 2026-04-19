-- Invoice event trail and manual close marker
CREATE TYPE "CreditCardInvoiceEventType" AS ENUM (
  'MANUAL_CLOSE',
  'MANUAL_REOPEN',
  'PAYMENT_CREATED',
  'SETTLEMENT_CREATED',
  'TRANSACTION_UPDATED',
  'TRANSACTION_DELETED'
);

ALTER TABLE "credit_card_invoices"
ADD COLUMN "manual_closed_at" TIMESTAMP(3);

ALTER TABLE "credit_card_invoices"
ADD COLUMN "manual_reopened_at" TIMESTAMP(3);

CREATE TABLE "credit_card_invoice_events" (
  "id" TEXT NOT NULL,
  "family_id" TEXT NOT NULL,
  "credit_card_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "transaction_id" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "action" "CreditCardInvoiceEventType" NOT NULL,
  "reason" TEXT,
  "payload_before" JSONB,
  "payload_after" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_card_invoice_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_card_invoice_events_family_id_invoice_id_created_at_idx"
ON "credit_card_invoice_events"("family_id", "invoice_id", "created_at");

CREATE INDEX "credit_card_invoice_events_credit_card_id_idx"
ON "credit_card_invoice_events"("credit_card_id");

CREATE INDEX "credit_card_invoice_events_transaction_id_idx"
ON "credit_card_invoice_events"("transaction_id");

CREATE INDEX "credit_card_invoice_events_actor_user_id_idx"
ON "credit_card_invoice_events"("actor_user_id");

ALTER TABLE "credit_card_invoice_events"
ADD CONSTRAINT "credit_card_invoice_events_family_id_fkey"
FOREIGN KEY ("family_id") REFERENCES "families"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_events"
ADD CONSTRAINT "credit_card_invoice_events_credit_card_id_fkey"
FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_events"
ADD CONSTRAINT "credit_card_invoice_events_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "credit_card_invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_events"
ADD CONSTRAINT "credit_card_invoice_events_transaction_id_fkey"
FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_events"
ADD CONSTRAINT "credit_card_invoice_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
