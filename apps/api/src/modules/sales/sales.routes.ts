import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { checkoutSchema } from "./sales.schemas";
import * as SalesService from "./sales.service";
import { requireCurrentSubscription } from "../../middleware/subscription";
import { branchForRequest } from "../../middleware/branchAccess";

export const salesRouter = Router();
salesRouter.use(requireAuth);

// POST /api/sales/checkout — any authenticated user (owner/manager/employee) can sell.
salesRouter.post(
  "/checkout",
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = checkoutSchema.parse(req.body);
    const branchId = branchForRequest(req, input.branchId) ?? req.auth!.branchId;
    if (!branchId) return res.status(400).json({ error: "No branch selected for this sale" });

    const sale = await SalesService.checkout(req.auth!.organizationId, branchId, req.auth!.userId, input);
    res.status(201).json({ sale });
  })
);

salesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const sales = await SalesService.listSales(req.auth!.organizationId, {
      branchId: branchForRequest(req, req.query.branchId as string | undefined),
    });
    res.json({ sales });
  })
);

salesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const sale = await SalesService.getSale(req.auth!.organizationId, req.params.id, branchForRequest(req));
    res.json({ sale });
  })
);

// Lightweight polling endpoint the frontend can hit every couple seconds
// while waiting for the customer to confirm an M-Pesa prompt.
salesRouter.get(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const sale = await SalesService.getSale(req.auth!.organizationId, req.params.id, branchForRequest(req));
    res.json({ status: sale.status, payments: sale.payments });
  })
);
