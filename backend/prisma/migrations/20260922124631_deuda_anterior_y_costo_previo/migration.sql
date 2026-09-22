-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "previous_cost_price" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "is_opening_balance" BOOLEAN NOT NULL DEFAULT false;

