import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createProductSchema,
  updateProductSchema,
  addVariantSchema,
  createCategorySchema,
} from "./products.schemas";
import * as ProductsService from "./products.service";
import { logAction } from "../organizations/audit.service";
import { env } from "../../config/env";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { badRequest, AppError } from "../../utils/errors";
import { requireCurrentSubscription } from "../../middleware/subscription";
import { branchForRequest } from "../../middleware/branchAccess";

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.post("/images", requireRole("OWNER", "MANAGER"), requireCurrentSubscription, asyncHandler(async (req, res) => {
  const { data, contentType } = req.body as { data?: string; contentType?: string };
  if (!data || !/^image\/(jpeg|png|webp)$/.test(contentType ?? "")) throw badRequest("Choose a JPEG, PNG, or WebP image");
  const mimeType = contentType as "image/jpeg" | "image/png" | "image/webp";
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw badRequest("Image must be smaller than 5 MB");
  const validImage = mimeType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validImage) throw badRequest("Uploaded file does not match its image type");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const path = `${req.auth!.organizationId}/${randomUUID()}.${extension}`;
  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    if (env.nodeEnv !== "development") throw new AppError(503, "Product image storage is not configured");
    const uploadPath = join(process.cwd(), "uploads", req.auth!.organizationId);
    await mkdir(uploadPath, { recursive: true });
    await writeFile(join(uploadPath, path.split("/")[1]), bytes, { flag: "wx" });
    res.status(201).json({ imageUrl: `${env.apiBaseUrl.replace(/\/$/, "")}/uploads/${path}` });
    return;
  }
  const base = env.supabase.url.replace(/\/$/, "");
  const storageHeaders: Record<string, string> = {
    apikey: env.supabase.serviceRoleKey,
    "Content-Type": mimeType,
    "x-upsert": "false",
  };
  // Supabase's new sb_secret_* API keys are not JWTs and must not be sent as
  // Bearer tokens. Legacy service_role keys are JWTs and still need this header.
  if (!env.supabase.serviceRoleKey.startsWith("sb_secret_")) {
    storageHeaders.Authorization = `Bearer ${env.supabase.serviceRoleKey}`;
  }
  const uploaded = await fetch(`${base}/storage/v1/object/${encodeURIComponent(env.supabase.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: storageHeaders, body: bytes,
  });
  if (!uploaded.ok) throw new AppError(502, "Image upload failed");
  res.status(201).json({ imageUrl: `${base}/storage/v1/object/public/${encodeURIComponent(env.supabase.bucket)}/${path.split("/").map(encodeURIComponent).join("/")}` });
}));

// GET /api/products?branchId=&search=
productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const products = await ProductsService.listProducts(req.auth!.organizationId, {
      branchId: branchForRequest(req, req.query.branchId as string | undefined),
      search: req.query.search as string | undefined,
    });
    res.json({ products });
  })
);

productsRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    res.json({ categories: await ProductsService.listCategories(req.auth!.organizationId) });
  })
);

productsRouter.post(
  "/categories",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const { name } = createCategorySchema.parse(req.body);
    const category = await ProductsService.createCategory(req.auth!.organizationId, name);
    res.status(201).json({ category });
  })
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await ProductsService.getProduct(req.auth!.organizationId, req.params.id);
    if (req.auth!.role === "EMPLOYEE" && req.auth!.branchId) {
      product.variants.forEach((variant) => { variant.inventory = variant.inventory.filter((item) => item.branchId === req.auth!.branchId); });
    }
    res.json({ product });
  })
);

// POST /api/products — Owner/Manager only (enforced server-side, not just hidden in UI)
productsRouter.post(
  "/",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    const product = await ProductsService.createProductWithActor(req.auth!.organizationId, req.auth!.userId, input);
    await logAction(req.auth!.organizationId, req.auth!.userId, "product.create", "Product", product.id, {
      name: product.name,
    });
    res.status(201).json({ product });
  })
);

productsRouter.patch(
  "/:id",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = updateProductSchema.parse(req.body);
    const product = await ProductsService.updateProduct(req.auth!.organizationId, req.params.id, input);
    await logAction(req.auth!.organizationId, req.auth!.userId, "product.update", "Product", product.id, input);
    res.json({ product });
  })
);

// "Delete" = archive, so historical sales/inventory records stay intact.
productsRouter.delete(
  "/:id",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const product = await ProductsService.updateProduct(req.auth!.organizationId, req.params.id, {
      isArchived: true,
    });
    await logAction(req.auth!.organizationId, req.auth!.userId, "product.archive", "Product", product.id);
    res.json({ product });
  })
);

productsRouter.post(
  "/:id/variants",
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = addVariantSchema.parse(req.body);
    const variant = await ProductsService.addVariant(
      req.auth!.organizationId,
      req.auth!.userId,
      req.params.id,
      input
    );
    await logAction(req.auth!.organizationId, req.auth!.userId, "product.add_variant", "ProductVariant", variant.id);
    res.status(201).json({ variant });
  })
);
