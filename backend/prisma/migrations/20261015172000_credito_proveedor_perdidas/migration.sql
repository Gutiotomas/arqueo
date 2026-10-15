ALTER TYPE "LossResolution" ADD VALUE 'SUPPLIER_CREDIT';

ALTER TABLE "purchases"
ADD COLUMN "credits_applied" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "supplier_credits" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "stock_loss_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "remaining_amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_credit_applications" (
    "id" UUID NOT NULL,
    "supplier_credit_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "supplier_credit_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_credits_stock_loss_id_key" ON "supplier_credits"("stock_loss_id");
CREATE INDEX "supplier_credits_business_id_supplier_id_remaining_amount_idx" ON "supplier_credits"("business_id", "supplier_id", "remaining_amount");
CREATE INDEX "supplier_credit_applications_purchase_id_idx" ON "supplier_credit_applications"("purchase_id");
CREATE INDEX "supplier_credit_applications_supplier_credit_id_idx" ON "supplier_credit_applications"("supplier_credit_id");

ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_stock_loss_id_fkey"
FOREIGN KEY ("stock_loss_id") REFERENCES "stock_losses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_applications" ADD CONSTRAINT "supplier_credit_applications_supplier_credit_id_fkey"
FOREIGN KEY ("supplier_credit_id") REFERENCES "supplier_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_applications" ADD CONSTRAINT "supplier_credit_applications_purchase_id_fkey"
FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
