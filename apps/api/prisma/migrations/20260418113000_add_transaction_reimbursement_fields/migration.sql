-- CreateEnum
CREATE TYPE "TransactionNature" AS ENUM ('NORMAL', 'REIMBURSEMENT', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL');

-- AlterTable
ALTER TABLE "transactions"
ADD COLUMN "nature" "TransactionNature" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "linked_transaction_id" TEXT;

-- CreateIndex
CREATE INDEX "transactions_linked_transaction_id_idx" ON "transactions"("linked_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_family_id_nature_idx" ON "transactions"("family_id", "nature");

-- AddForeignKey
ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_linked_transaction_id_fkey"
FOREIGN KEY ("linked_transaction_id") REFERENCES "transactions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
