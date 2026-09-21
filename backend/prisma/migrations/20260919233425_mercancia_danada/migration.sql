-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('DAMAGED', 'EXPIRED', 'THEFT', 'OTHER');

-- CreateEnum
CREATE TYPE "LossResolution" AS ENUM ('PENDING', 'FREE', 'DISCOUNTED', 'NONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'LOSS';
ALTER TYPE "StockMovementType" ADD VALUE 'REPLACEMENT';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "stock_loss_id" UUID;

-- CreateTable
CREATE TABLE "stock_losses" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID,
    "user_id" UUID,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "reason" "LossReason" NOT NULL,
    "resolution" "LossResolution" NOT NULL DEFAULT 'PENDING',
    "replacement_unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod",
    "loss_amount" DECIMAL(14,2) NOT NULL,
    "resolved_at" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_losses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_losses_business_id_date_idx" ON "stock_losses"("business_id", "date");

-- CreateIndex
CREATE INDEX "stock_losses_product_id_idx" ON "stock_losses"("product_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_loss_id_fkey" FOREIGN KEY ("stock_loss_id") REFERENCES "stock_losses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_losses" ADD CONSTRAINT "stock_losses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_losses" ADD CONSTRAINT "stock_losses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_losses" ADD CONSTRAINT "stock_losses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_losses" ADD CONSTRAINT "stock_losses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
