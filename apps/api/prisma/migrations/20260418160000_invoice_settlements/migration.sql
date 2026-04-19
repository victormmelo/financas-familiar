-- Extend invoice status enum for advanced lifecycle
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'RENEGOTIATED';

-- Settlement enums
CREATE TYPE "CreditCardInvoiceSettlementStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE "CreditCardInvoiceSettlementInstallmentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- Extra bookkeeping columns
ALTER TABLE "credit_card_invoices"
ADD COLUMN "renegotiated_at" TIMESTAMP(3);

-- Core settlement tables
CREATE TABLE "credit_card_invoice_settlements" (
  "id" TEXT NOT NULL,
  "family_id" TEXT NOT NULL,
  "credit_card_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "status" "CreditCardInvoiceSettlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "total_original" DECIMAL(15,2) NOT NULL,
  "down_payment" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "negotiated_total" DECIMAL(15,2) NOT NULL,
  "installment_count" INTEGER NOT NULL,
  "first_installment_month" INTEGER NOT NULL,
  "first_installment_year" INTEGER NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_card_invoice_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_card_invoice_settlement_installments" (
  "id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "due_reference_month" INTEGER NOT NULL,
  "due_reference_year" INTEGER NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "status" "CreditCardInvoiceSettlementInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMP(3),
  "paid_transaction_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_card_invoice_settlement_installments_pkey" PRIMARY KEY ("id")
);

-- Indexes

CREATE INDEX "credit_card_invoice_settlements_family_id_status_idx"
ON "credit_card_invoice_settlements"("family_id", "status");

CREATE INDEX "credit_card_invoice_settlements_credit_card_id_idx"
ON "credit_card_invoice_settlements"("credit_card_id");

CREATE INDEX "credit_card_invoice_settlements_invoice_id_idx"
ON "credit_card_invoice_settlements"("invoice_id");

CREATE UNIQUE INDEX "credit_card_invoice_settlement_installments_settlement_id_sequence_key"
ON "credit_card_invoice_settlement_installments"("settlement_id", "sequence");

CREATE INDEX "credit_card_invoice_settlement_installments_due_reference_year_due_reference_month_idx"
ON "credit_card_invoice_settlement_installments"("due_reference_year", "due_reference_month");

CREATE UNIQUE INDEX "credit_card_invoice_settlement_installments_paid_transaction_id_key"
ON "credit_card_invoice_settlement_installments"("paid_transaction_id");

-- Foreign keys
ALTER TABLE "credit_card_invoice_settlements"
ADD CONSTRAINT "credit_card_invoice_settlements_family_id_fkey"
FOREIGN KEY ("family_id") REFERENCES "families"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_settlements"
ADD CONSTRAINT "credit_card_invoice_settlements_credit_card_id_fkey"
FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_settlements"
ADD CONSTRAINT "credit_card_invoice_settlements_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "credit_card_invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_settlements"
ADD CONSTRAINT "credit_card_invoice_settlements_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_settlement_installments"
ADD CONSTRAINT "credit_card_invoice_settlement_installments_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "credit_card_invoice_settlements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_invoice_settlement_installments"
ADD CONSTRAINT "credit_card_invoice_settlement_installments_paid_transaction_id_fkey"
FOREIGN KEY ("paid_transaction_id") REFERENCES "transactions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
