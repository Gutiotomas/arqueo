-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'RECEIVED');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "purchase_id" UUID,
ADD COLUMN     "received_at" DATE,
ADD COLUMN     "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_purchase_id_key" ON "purchase_orders"("purchase_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

