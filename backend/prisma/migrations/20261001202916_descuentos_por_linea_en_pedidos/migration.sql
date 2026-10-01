-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "is_discount" BOOLEAN NOT NULL DEFAULT false;

-- Los pedidos que ya tenian un descuento a bulto lo conservan como una linea
-- de descuento, con su motivo de descripcion.
INSERT INTO "purchase_order_items" ("id", "order_id", "product_id", "description", "quantity", "unit_price", "subtotal", "position", "is_discount")
SELECT gen_random_uuid(), "id", NULL, COALESCE(NULLIF("discount_reason", ''), 'Descuento'), 1, "discount", "discount", 9999, true
FROM "purchase_orders"
WHERE "discount" > 0;

-- AlterTable
ALTER TABLE "purchase_orders" DROP COLUMN "discount_reason";
