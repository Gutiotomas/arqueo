-- La forma de pago pasa de la venta a cada linea: de seis arepas, dos pueden
-- ir en efectivo, dos por transferencia y dos fiadas. Las lineas que ya
-- existen heredan la forma de pago de su venta antes de que la columna
-- desaparezca de la venta.

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH';

UPDATE "sale_items" si
SET "payment_method" = s."payment_method"
FROM "sales" s
WHERE s."id" = si."sale_id";

ALTER TABLE "sale_items" ALTER COLUMN "payment_method" DROP DEFAULT;

-- DropForeignKey
ALTER TABLE "sale_payments" DROP CONSTRAINT "sale_payments_business_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_payments" DROP CONSTRAINT "sale_payments_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_payments" DROP CONSTRAINT "sale_payments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_customer_id_fkey";

-- DropIndex
DROP INDEX "sales_business_id_payment_method_idx";

-- DropIndex
DROP INDEX "sales_customer_id_idx";

-- DropTable
DROP TABLE "sale_payments";

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "user_id" UUID,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_payments_business_id_date_idx" ON "customer_payments"("business_id", "date");

-- CreateIndex
CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments"("customer_id");

-- CreateIndex
CREATE INDEX "sale_items_customer_id_idx" ON "sale_items"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "sales" DROP COLUMN "customer_id",
DROP COLUMN "paid_amount",
DROP COLUMN "payment_method";

