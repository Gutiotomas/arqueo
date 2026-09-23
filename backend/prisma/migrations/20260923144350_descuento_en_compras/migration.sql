-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;


-- Las compras de antes no tenian descuento: su subtotal es su total.
UPDATE "purchases" SET "subtotal" = "total";
