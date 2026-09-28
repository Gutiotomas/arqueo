-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_distributions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "date" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profit_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_distribution_items" (
    "id" UUID NOT NULL,
    "distribution_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,

    CONSTRAINT "profit_distribution_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_business_id_idx" ON "partners"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_business_id_name_key" ON "partners"("business_id", "name");

-- CreateIndex
CREATE INDEX "profit_distributions_business_id_date_idx" ON "profit_distributions"("business_id", "date");

-- CreateIndex
CREATE INDEX "profit_distribution_items_distribution_id_idx" ON "profit_distribution_items"("distribution_id");

-- CreateIndex
CREATE INDEX "profit_distribution_items_partner_id_idx" ON "profit_distribution_items"("partner_id");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_distributions" ADD CONSTRAINT "profit_distributions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_distributions" ADD CONSTRAINT "profit_distributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_distribution_items" ADD CONSTRAINT "profit_distribution_items_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "profit_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_distribution_items" ADD CONSTRAINT "profit_distribution_items_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

