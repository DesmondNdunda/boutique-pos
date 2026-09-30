import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import * as WooCommerce from "./woocommerce.service";

export const wooCommerceRouter = Router();
wooCommerceRouter.use(requireAuth, requireRole("OWNER"));

wooCommerceRouter.get("/", asyncHandler(async (req, res) => {
  res.json(await WooCommerce.getStatus(req.auth!.organizationId));
}));

wooCommerceRouter.post("/connect", asyncHandler(async (req, res) => {
  const input = z.object({
    storeUrl: z.string().trim().min(8).max(255),
    consumerKey: z.string().trim().min(8).max(160),
    consumerSecret: z.string().trim().min(8).max(160),
  }).parse(req.body);
  res.json(await WooCommerce.connect(req.auth!.organizationId, input));
}));

wooCommerceRouter.delete("/", asyncHandler(async (req, res) => {
  await WooCommerce.disconnect(req.auth!.organizationId);
  res.status(204).send();
}));

wooCommerceRouter.get("/gateways", asyncHandler(async (req, res) => {
  res.json({ gateways: await WooCommerce.listGateways(req.auth!.organizationId) });
}));

wooCommerceRouter.patch("/gateways/:gatewayId", asyncHandler(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const gateway = await WooCommerce.setGatewayEnabled(req.auth!.organizationId, req.params.gatewayId, enabled);
  res.json({ gateway });
}));

wooCommerceRouter.post("/sync", asyncHandler(async (req, res) => {
  const result = await WooCommerce.syncStore(req.auth!.organizationId, req.auth!.userId);
  res.json({ result });
}));
