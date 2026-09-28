import { prisma } from "../../lib/prisma";
import { notFound } from "../../utils/errors";

// Creates a Product plus its ProductVariant rows, and seeds Inventory rows
// (quantity=0 or initialStock) for the given branch, attributing the initial
// stock movement to the acting user. If hasVariants=false, a single
// "default" variant with size=null,color=null is created — the rest of the
// system (sales, inventory) treats it identically to any other variant, so
// we never need special-case logic downstream.
export async function createProductWithActor(
  organizationId: string,
  userId: string,
  input: {
    name: string;
    description?: string;
    categoryId?: string;
    basePrice: number;
    imageUrl?: string;
    hasVariants: boolean;
    branchId: string;
    variants: { size?: string | null; color?: string | null; price?: number; initialStock: number }[];
  }
) {
  return prisma.product.create({
    data: {
      organizationId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      basePrice: input.basePrice,
      imageUrl: input.imageUrl,
      hasVariants: input.hasVariants,
      variants: {
        create: input.variants.map((variant) => ({
          size: variant.size ?? null,
          color: variant.color ?? null,
          price: variant.price,
          inventory: { create: { branchId: input.branchId, quantity: variant.initialStock } },
          ...(variant.initialStock > 0 ? {
            stockMovements: {
              create: {
                organizationId,
                branchId: input.branchId,
                userId,
                reason: "RESTOCK",
                quantityBefore: 0,
                quantityChange: variant.initialStock,
                quantityAfter: variant.initialStock,
                note: "Initial stock on product creation",
              },
            },
          } : {}),
        })),
      },
    },
    include: { variants: { include: { inventory: true } }, category: true },
  });
}

export async function listProducts(organizationId: string, opts: { branchId?: string; search?: string } = {}) {
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      isArchived: false,
      ...(opts.search ? { name: { contains: opts.search, mode: "insensitive" } } : {}),
    },
    include: {
      category: true,
      variants: {
        include: {
          inventory: opts.branchId ? { where: { branchId: opts.branchId } } : true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return products;
}

export async function getProduct(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    include: { category: true, variants: { include: { inventory: true } } },
  });
  if (!product) throw notFound("Product not found");
  return product;
}

export async function updateProduct(organizationId: string, productId: string, data: Record<string, any>) {
  await getProduct(organizationId, productId);
  return prisma.product.update({ where: { id: productId }, data });
}

export async function addVariant(
  organizationId: string,
  userId: string,
  productId: string,
  input: { size?: string | null; color?: string | null; price?: number; initialStock: number; branchId: string }
) {
  await getProduct(organizationId, productId);
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({
      data: { productId, size: input.size ?? null, color: input.color ?? null, price: input.price },
    });
    await tx.inventory.create({
      data: { branchId: input.branchId, variantId: variant.id, quantity: input.initialStock },
    });
    if (input.initialStock > 0) {
      await tx.stockMovement.create({
        data: {
          organizationId,
          branchId: input.branchId,
          variantId: variant.id,
          userId,
          reason: "RESTOCK",
          quantityBefore: 0,
          quantityChange: input.initialStock,
          quantityAfter: input.initialStock,
          note: "New variant added",
        },
      });
    }
    return variant;
  });
}

export async function listCategories(organizationId: string) {
  return prisma.category.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function createCategory(organizationId: string, name: string) {
  return prisma.category.create({ data: { organizationId, name } });
}
