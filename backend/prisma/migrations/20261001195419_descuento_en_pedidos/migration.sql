-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;


-- Los pedidos de antes no tenian descuento: su suma es su total.
UPDATE "purchase_orders" SET "subtotal" = "total";
