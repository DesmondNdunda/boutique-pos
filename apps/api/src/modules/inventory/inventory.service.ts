import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { StockMovementReason } from "@prisma/client";

// Every stock change (restock, sale, adjustment, return, damage) goes
// through this one function so quantityBefore/After and the movement log
// are always consistent — nothing ever writes to Inventory.quantity directly
// except this. Runs inside the caller's transaction if `tx` is passed,
// otherwise opens its own.
export async function applyStockChange(
  organizationId: string,
  branchId: string,
  variantId: string,
  userId: string,
  reason: StockMovementReason,
  quantityChange: number,
  note?: string,
  tx?: any
) {
  const client = tx ?? prisma;

  let inventory = await client.inventory.findUnique({ where: { branchId_variantId: { branchId, variantId } } });
  if (!inventory) {
    inventory = await client.inventory.create({ data: { branchId, variantId, quantity: 0 } });
  }

  const quantityAfter = inventory.quantity + quantityChange;
  if (quantityAfter < 0) {
    throw badRequest(
      `Insufficient stock: only ${inventory.quantity} available, tried to remove ${-quantityChange}`
    );
  }

  await client.inventory.update({ where: { id: inventory.id }, data: { quantity: quantityAfter } });

  await client.stockMovement.create({
    data: {
      organizationId,
      branchId,
      variantId,
      userId,
      reason,
      quantityBefore: inventory.quantity,
      quantityChange,
      quantityAfter,
      note,
    },
  });

  return { quantityBefore: inventory.quantity, quantityAfter };
}

export async function restock(
  organizationId: string,
  userId: string,
  input: { variantId: string; branchId: string; quantity: number; note?: string }
) {
  return prisma.$transaction((tx) =>
    applyStockChange(organizationId, input.branchId, input.variantId, userId, "RESTOCK", input.quantity, input.note, tx)
  );
}

export async function adjust(
  organizationId: string,
  userId: string,
  input: { variantId: string; branchId: string; quantityChange: number; reason: StockMovementReason; note?: string }
) {
  return prisma.$transaction((tx) =>
    applyStockChange(
      organizationId,
      input.branchId,
      input.variantId,
      userId,
      input.reason,
      input.quantityChange,
      input.note,
      tx
    )
  );
}

export async function getMovements(organizationId: string, opts: { branchId?: string; variantId?: string }) {
  return prisma.stockMovement.findMany({
    where: {
      organizationId,
      branchId: opts.branchId,
      variantId: opts.variantId,
    },
    include: {
      variant: { include: { product: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function lowStock(organizationId: string, branchId: string, threshold = 5) {
  const rows = await prisma.inventory.findMany({
    where: { branchId, quantity: { lte: threshold }, variant: { product: { organizationId, isArchived: false } } },
    include: { variant: { include: { product: true } } },
    orderBy: { quantity: "asc" },
  });
  return rows;
}
