-- AlterEnum: Add PENDING to TransactionStatus
ALTER TYPE "TransactionStatus" ADD VALUE 'PENDING';

-- AlterTable: Add isFixed to Category
ALTER TABLE "categories" ADD COLUMN "is_fixed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add dueDate and settledAt to Transaction
ALTER TABLE "transactions" ADD COLUMN "due_date" DATE;
ALTER TABLE "transactions" ADD COLUMN "settled_at" TIMESTAMP(3);
