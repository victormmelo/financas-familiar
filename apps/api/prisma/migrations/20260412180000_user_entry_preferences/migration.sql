-- CreateEnum
CREATE TYPE "EntryExpenseSettlement" AS ENUM ('ACCOUNT', 'CARD');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "entry_default_account_id" TEXT;
ALTER TABLE "users" ADD COLUMN "entry_default_credit_card_id" TEXT;
ALTER TABLE "users" ADD COLUMN "entry_expense_settlement" "EntryExpenseSettlement";

-- CreateIndex
CREATE INDEX "users_entry_default_account_id_idx" ON "users"("entry_default_account_id");
CREATE INDEX "users_entry_default_credit_card_id_idx" ON "users"("entry_default_credit_card_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_entry_default_account_id_fkey" FOREIGN KEY ("entry_default_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_entry_default_credit_card_id_fkey" FOREIGN KEY ("entry_default_credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
