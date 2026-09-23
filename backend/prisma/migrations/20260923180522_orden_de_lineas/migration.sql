-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

