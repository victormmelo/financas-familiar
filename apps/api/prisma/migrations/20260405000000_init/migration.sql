-- CreateEnum
CREATE TYPE "StatementSource" AS ENUM ('OFX', 'CSV', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatementItemStatus" AS ENUM ('PENDING', 'MATCHED', 'REJECTED', 'IGNORED', 'CONVERTED');

-- CreateTable
CREATE TABLE "reconciliation_sessions" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source" "StatementSource" NOT NULL,
    "file_name" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_items" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "session_id" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "external_id" VARCHAR(255),
    "status" "StatementItemStatus" NOT NULL DEFAULT 'PENDING',
    "matched_transaction_id" TEXT,
    "match_score" INTEGER,
    "ignored_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statement_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_items_family_id_account_id_date_idx" ON "statement_items"("family_id", "account_id", "date");

-- CreateIndex
CREATE INDEX "statement_items_family_id_status_idx" ON "statement_items"("family_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "statement_items_account_id_external_id_key" ON "statement_items"("account_id", "external_id");

-- AddForeignKey
ALTER TABLE "reconciliation_sessions" ADD CONSTRAINT "reconciliation_sessions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_sessions" ADD CONSTRAINT "reconciliation_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_sessions" ADD CONSTRAINT "reconciliation_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_items" ADD CONSTRAINT "statement_items_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_items" ADD CONSTRAINT "statement_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_items" ADD CONSTRAINT "statement_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reconciliation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_items" ADD CONSTRAINT "statement_items_matched_transaction_id_fkey" FOREIGN KEY ("matched_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
