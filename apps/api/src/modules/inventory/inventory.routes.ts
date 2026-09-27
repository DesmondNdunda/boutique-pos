import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import { restockSchema, adjustSchema } from "./inventory.schemas";
import * as InventoryService from "./inventory.service";
import { logAction } from "../organizations/audit.service";
import { z } from "zod";
import { badRequest, notFound } from "../../utils/errors";
import { prisma } from "../../lib/prisma";
import { requireCurrentSubscription } from "../../middleware/subscription";
import { branchForRequest } from "../../middleware/branchAccess";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

// Move stock atomically between two branches owned by this organization.
inventoryRouter.post("/transfer", requireRole("OWNER", "MANAGER"), requireCurrentSubscription, asyncHandler(async (req, res) => {
  const { variantId, fromBranchId, toBranchId, quantity, note } = z.object({
    variantId: z.string().min(1), fromBranchId: z.string().min(1), toBranchId: z.string().min(1),
    quantity: z.number().int().positive(), note: z.string().max(500).optional(),
  }).parse(req.body);
  if (fromBranchId === toBranchId) throw badRequest("Choose two different branches");
  const orgId = req.auth!.organizationId;
  const result = await prisma.$transaction(async (tx) => {
    const [fromBranch, toBranch, variant] = await Promise.all([
      tx.branch.findFirst({ where: { id: fromBranchId, organizationId: orgId } }),
      tx.branch.findFirst({ where: { id: toBranchId, organizationId: orgId } }),
      tx.productVariant.findFirst({ where: { id: variantId, product: { organizationId: orgId, isArchived: false } } }),
    ]);
    if (!fromBranch || !toBranch || !variant) throw notFound("Branch or product variant not found");
    const source = await tx.inventory.findUnique({ where: { branchId_variantId: { branchId: fromBranchId, variantId } } });
    if (!source || source.quantity < quantity) throw badRequest("Not enough stock at the source branch");
    const target = await tx.inventory.findUnique({ where: { branchId_variantId: { branchId: toBranchId, variantId } } });
    const beforeTarget = target?.quantity ?? 0;
    await tx.inventory.update({ where: { id: source.id }, data: { quantity: { decrement: quantity } } });
    await tx.inventory.upsert({
      where: { branchId_variantId: { branchId: toBranchId, variantId } },
      create: { branchId: toBranchId, variantId, quantity },
      update: { quantity: { increment: quantity } },
    });
    await tx.stockMovement.createMany({ data: [
      { organizationId: orgId, branchId: fromBranchId, variantId, userId: req.auth!.userId, reason: "TRANSFER", quantityBefore: source.quantity, quantityChange: -quantity, quantityAfter: source.quantity - quantity, note: note ?? `Transfer to ${toBranch.name}` },
      { organizationId: orgId, branchId: toBranchId, variantId, userId: req.auth!.userId, reason: "TRANSFER", quantityBefore: beforeTarget, quantityChange: quantity, quantityAfter: beforeTarget + quantity, note: note ?? `Transfer from ${fromBranch.name}` },
    ] });
    return { fromQuantity: source.quantity - quantity, toQuantity: beforeTarget + quantity };
  }, { isolationLevel: "Serializable" });
  await logAction(orgId, req.auth!.userId, "inventory.transfer", "ProductVariant", variantId, { fromBranchId, toBranchId, quantity });
  res.json(result);
}));

// Restock and adjustments are Owner/Manager only — employees can only sell,
// which decrements stock automatically (see sales module).
inventoryRouter.post(
  "/restock",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = restockSchema.parse(req.body);
    const result = await InventoryService.restock(req.auth!.organizationId, req.auth!.userId, input);
    await logAction(req.auth!.organizationId, req.auth!.userId, "inventory.restock", "ProductVariant", input.variantId, {
      quantity: input.quantity,
    });
    res.json(result);
  })
);

inventoryRouter.post(
  "/adjust",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = adjustSchema.parse(req.body);
    const result = await InventoryService.adjust(req.auth!.organizationId, req.auth!.userId, input);
    await logAction(req.auth!.organizationId, req.auth!.userId, "inventory.adjust", "ProductVariant", input.variantId, {
      change: input.quantityChange,
      reason: input.reason,
    });
    res.json(result);
  })
);

inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const movements = await InventoryService.getMovements(req.auth!.organizationId, {
      branchId: branchForRequest(req, req.query.branchId as string | undefined),
      variantId: req.query.variantId as string | undefined,
    });
    res.json({ movements });
  })
);

inventoryRouter.get(
  "/low-stock",
  asyncHandler(async (req, res) => {
    const branchId = branchForRequest(req, req.query.branchId as string | undefined) ?? req.auth!.branchId;
    if (!branchId) return res.json({ items: [] });
    const threshold = Number(req.query.threshold ?? 5);
    const items = await InventoryService.lowStock(req.auth!.organizationId, branchId, threshold);
    res.json({ items });
  })
);
