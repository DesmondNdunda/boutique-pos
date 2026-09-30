ALTER TABLE "sales" ADD COLUMN "externalOrderId" TEXT;
ALTER TABLE "products" ADD COLUMN "wooCommerceId" TEXT;
ALTER TABLE "product_variants" ADD COLUMN "wooCommerceVariationId" TEXT;

CREATE UNIQUE INDEX "sales_organizationId_externalOrderId_key"
ON "sales"("organizationId", "externalOrderId");

CREATE UNIQUE INDEX "products_organizationId_wooCommerceId_key"
ON "products"("organizationId", "wooCommerceId");

CREATE UNIQUE INDEX "product_variants_productId_wooCommerceVariationId_key"
ON "product_variants"("productId", "wooCommerceVariationId");

CREATE TABLE "woocommerce_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "consumerKeyEncrypted" TEXT NOT NULL,
    "consumerSecretEncrypted" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "woocommerce_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "woocommerce_integrations_organizationId_key"
ON "woocommerce_integrations"("organizationId");

ALTER TABLE "woocommerce_integrations" ADD CONSTRAINT "woocommerce_integrations_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
