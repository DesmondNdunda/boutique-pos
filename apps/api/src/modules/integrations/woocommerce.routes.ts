import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import * as WooCommerce from "./woocommerce.service";
import multer from "multer";
import { AppError, badRequest } from "../../utils/errors";

export const wooCommerceRouter = Router();
wooCommerceRouter.use(requireAuth, requireRole("OWNER"));
const pluginZipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".zip")) return callback(badRequest("Choose a .zip plugin file"));
    callback(null, true);
  },
});

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

wooCommerceRouter.put("/wordpress-access", asyncHandler(async (req, res) => {
  const input = z.object({
    username: z.string().trim().min(1).max(150),
    applicationPassword: z.string().trim().min(16).max(128),
  }).parse(req.body);
  res.json(await WooCommerce.saveWordPressAccess(req.auth!.organizationId, input.username, input.applicationPassword));
}));

wooCommerceRouter.get("/wordpress-plugins", asyncHandler(async (req, res) => {
  res.json(await WooCommerce.getRecommendedPlugins(req.auth!.organizationId));
}));

wooCommerceRouter.get("/wordpress-file-installer", asyncHandler(async (req, res) => {
  res.json(await WooCommerce.getFileInstallerStatus(req.auth!.organizationId));
}));

wooCommerceRouter.post("/wordpress-plugins/:slug/install", asyncHandler(async (req, res) => {
  const { slug } = z.object({ slug: z.string().trim().min(1).max(80) }).parse(req.params);
  res.json(await WooCommerce.installRecommendedPlugin(req.auth!.organizationId, slug));
}));

wooCommerceRouter.post("/wordpress-plugins/upload", (req, res, next) => {
  pluginZipUpload.single("pluginZip")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return next(new AppError(413, "Plugin ZIP files must be smaller than 20 MB"));
    if (error instanceof multer.MulterError) return next(badRequest("Choose one valid .zip plugin file"));
    next(error);
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest("Choose a plugin ZIP file");
  const result = await WooCommerce.uploadPluginZip(req.auth!.organizationId, { buffer: req.file.buffer, originalname: req.file.originalname });
  res.status(201).json(result);
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
