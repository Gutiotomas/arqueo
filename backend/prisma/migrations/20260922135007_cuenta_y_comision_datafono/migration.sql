-- CreateEnum
CREATE TYPE "AccountMovementType" AS ENUM ('CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'OTHER_IN', 'OTHER_OUT');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "card_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "card_fee" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "account_movements" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "date" DATE NOT NULL,
    "type" "AccountMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_closings" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "date" DATE NOT NULL,
    "opening_balance" DECIMAL(14,2),
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "expected_balance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_movements_business_id_date_idx" ON "account_movements"("business_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "account_closings_business_id_date_key" ON "account_closings"("business_id", "date");

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_closings" ADD CONSTRAINT "account_closings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_closings" ADD CONSTRAINT "account_closings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

