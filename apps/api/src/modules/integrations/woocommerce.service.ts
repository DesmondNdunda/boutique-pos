import axios, { AxiosInstance } from "axios";
import { lookup as dnsLookup } from "node:dns";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup as resolveHost } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent as HttpsAgent } from "node:https";
import { integrationEncryptionKey, isProd } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError, badRequest } from "../../utils/errors";
import { applyStockChange } from "../inventory/inventory.service";

type WooCredentials = { storeUrl: string; consumerKey: string; consumerSecret: string };

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new AppError(500, "WooCommerce credentials could not be read");
  const decipher = createDecipheriv("aes-256-gcm", integrationEncryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function privateAddress(address: string) {
  const normalized = address.toLowerCase().split("%", 1)[0];
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51) || (a === 203 && b === 0);
  }
  if (isIP(normalized) === 6) {
    if (normalized.startsWith("::ffff:")) return privateAddress(normalized.slice(7));
    return normalized === "::" || normalized === "::1" || /^(fc|fd|fe[89ab]|ff)/.test(normalized) || normalized.startsWith("2001:db8:");
  }
  return true;
}

const publicOnlyLookup = ((hostname: string, options: any, callback: (...args: any[]) => void) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, records) => {
    const done = callback as any;
    if (error || !records.length || records.some((record) => privateAddress(record.address))) {
      done(error ?? new Error("WooCommerce host resolved to a private address"));
      return;
    }
    if (typeof options === "object" && options.all) done(null, records);
    else done(null, records[0].address, records[0].family);
  });
}) as any;

async function normalizeStoreUrl(input: string) {
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw badRequest("Enter a valid WooCommerce store URL"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw badRequest("Store URL must not include credentials, query parameters, or a fragment");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (isProd ? parsed.protocol !== "https:" : (!local && parsed.protocol !== "https:")) {
    throw badRequest("WooCommerce store URL must use HTTPS");
  }
  if (parsed.port && parsed.port !== "443" && !(local && !isProd)) throw badRequest("WooCommerce connections must use the standard secure web port");
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) throw badRequest("Use a public WooCommerce store URL");
  if (!local) {
    if (isIP(hostname)) throw badRequest("Use the store's public domain name, not an IP address");
    let records;
    try { records = await resolveHost(hostname, { all: true, verbatim: true }); }
    catch { throw badRequest("The WooCommerce store domain could not be resolved"); }
    if (!records.length || records.some((record) => privateAddress(record.address))) throw badRequest("WooCommerce must resolve to a public server address");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

async function clientFor(input: WooCredentials): Promise<AxiosInstance> {
  const baseURL = `${await normalizeStoreUrl(input.storeUrl)}/wp-json/wc/v3`;
  return axios.create({
    baseURL,
    auth: { username: input.consumerKey, password: input.consumerSecret },
    timeout: 15000,
    maxRedirects: 0,
    httpsAgent: new HttpsAgent({ lookup: publicOnlyLookup }),
    headers: { Accept: "application/json" },
  });
}

async function getCredentials(organizationId: string): Promise<WooCredentials> {
  const integration = await prisma.wooCommerceIntegration.findUnique({ where: { organizationId } });
  if (!integration) throw new AppError(404, "WooCommerce is not connected");
  return {
    storeUrl: integration.storeUrl,
    consumerKey: decrypt(integration.consumerKeyEncrypted),
    consumerSecret: decrypt(integration.consumerSecretEncrypted),
  };
}

function externalError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) throw new AppError(400, "WooCommerce rejected the API key. Check that it has read and write access.");
    if (status === 404) throw new AppError(400, "WooCommerce REST API was not found. Check that WooCommerce is installed and the store URL is correct.");
    if (status === 429) throw new AppError(429, "WooCommerce is temporarily rate limiting requests. Try again shortly.");
    if (!status) throw new AppError(502, "Could not reach the WooCommerce store. Check its URL and availability.");
    throw new AppError(502, `WooCommerce returned an error (HTTP ${status}).`);
  }
  throw error;
}

export async function getStatus(organizationId: string) {
  const integration = await prisma.wooCommerceIntegration.findUnique({
    where: { organizationId },
    select: { storeUrl: true, lastSyncAt: true, updatedAt: true },
  });
  return integration ? { connected: true, ...integration } : { connected: false };
}

export async function connect(organizationId: string, input: WooCredentials) {
  const credentials = { ...input, storeUrl: await normalizeStoreUrl(input.storeUrl) };
  try {
    await (await clientFor(credentials)).get("products", { params: { per_page: 1 } });
  } catch (error) { externalError(error); }
  const integration = await prisma.wooCommerceIntegration.upsert({
    where: { organizationId },
    create: {
      organizationId,
      storeUrl: credentials.storeUrl,
      consumerKeyEncrypted: encrypt(credentials.consumerKey),
      consumerSecretEncrypted: encrypt(credentials.consumerSecret),
    },
    update: {
      storeUrl: credentials.storeUrl,
      consumerKeyEncrypted: encrypt(credentials.consumerKey),
      consumerSecretEncrypted: encrypt(credentials.consumerSecret),
    },
    select: { storeUrl: true, lastSyncAt: true, updatedAt: true },
  });
  return { connected: true, ...integration };
}

export async function disconnect(organizationId: string) {
  await prisma.wooCommerceIntegration.deleteMany({ where: { organizationId } });
}

export async function listGateways(organizationId: string) {
  const client = await clientFor(await getCredentials(organizationId));
  try {
    const { data } = await client.get("payment_gateways");
    return (data as any[]).map((gateway) => ({
      id: String(gateway.id),
      title: String(gateway.title ?? gateway.method_title ?? gateway.id),
      description: String(gateway.description ?? ""),
      enabled: Boolean(gateway.enabled),
      methodTitle: String(gateway.method_title ?? ""),
    }));
  } catch (error) { externalError(error); }
}

export async function setGatewayEnabled(organizationId: string, gatewayId: string, enabled: boolean) {
  if (!/^[a-z0-9_-]{1,80}$/i.test(gatewayId)) throw badRequest("Invalid payment gateway identifier");
  const client = await clientFor(await getCredentials(organizationId));
  try {
    const { data } = await client.put(`payment_gateways/${encodeURIComponent(gatewayId)}`, { enabled });
    return { id: String(data.id), title: String(data.title ?? data.method_title ?? data.id), enabled: Boolean(data.enabled) };
  } catch (error) { externalError(error); }
}

export async function markSynced(organizationId: string) {
  await prisma.wooCommerceIntegration.update({ where: { organizationId }, data: { lastSyncAt: new Date() } });
}

async function fetchPages(client: AxiosInstance, path: string, params: Record<string, string | number> = {}) {
  const rows: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await client.get(path, { params: { ...params, per_page: 100, page } });
    if (!Array.isArray(data)) throw new AppError(502, "WooCommerce returned an unexpected response");
    rows.push(...data);
    if (data.length < 100) break;
  }
  return rows;
}

const safeImageUrl = (images: any[]) => {
  const source = typeof images?.[0]?.src === "string" ? images[0].src : "";
  try { const url = new URL(source); return url.protocol === "https:" ? url.toString() : undefined; }
  catch { return undefined; }
};

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export async function syncStore(organizationId: string, actorUserId: string) {
  const client = await clientFor(await getCredentials(organizationId));
  try {
    const currentIntegration = await prisma.wooCommerceIntegration.findUnique({ where: { organizationId }, select: { lastSyncAt: true } });
    const firstSync = !currentIntegration?.lastSyncAt;
    const branch = await prisma.branch.findFirst({ where: { organizationId, isMain: true }, select: { id: true } });
    if (!branch) throw new AppError(400, "Create a main branch before syncing WooCommerce");
    const wcProducts = await fetchPages(client, "products", { status: "publish" });
    let productsUpdated = 0;
    for (const wcProduct of wcProducts) {
      if (!Number.isInteger(wcProduct.id) || !["simple", "variable"].includes(wcProduct.type)) continue;
      const name = cleanText(wcProduct.name, 150);
      const basePrice = Number(wcProduct.price || wcProduct.regular_price);
      if (!name || !Number.isFinite(basePrice) || basePrice <= 0) continue;

      const categoryName = cleanText(wcProduct.categories?.[0]?.name, 80);
      const category = categoryName
        ? await prisma.category.upsert({ where: { organizationId_name: { organizationId, name: categoryName } }, create: { organizationId, name: categoryName }, update: {} })
        : null;
      let product = await prisma.product.findFirst({ where: { organizationId, wooCommerceId: String(wcProduct.id) } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            organizationId, wooCommerceId: String(wcProduct.id), name,
            description: cleanText(wcProduct.short_description || wcProduct.description, 1000) || null,
            basePrice, imageUrl: safeImageUrl(wcProduct.images), categoryId: category?.id,
            hasVariants: wcProduct.type === "variable",
          },
        });
      } else {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            name, description: cleanText(wcProduct.short_description || wcProduct.description, 1000) || null,
            basePrice, imageUrl: safeImageUrl(wcProduct.images), categoryId: category?.id,
          },
        });
      }

      let wcVariants: any[] = [];
      if (wcProduct.type === "variable") {
        wcVariants = await fetchPages(client, `products/${wcProduct.id}/variations`, { status: "publish" });
      } else {
        wcVariants = [{ ...wcProduct, id: wcProduct.id, stock_quantity: wcProduct.stock_quantity }];
      }

      for (const wcVariant of wcVariants) {
        const variantPrice = Number(wcVariant.price || wcVariant.regular_price || basePrice);
        const attrs: readonly (readonly [string, string])[] = (wcVariant.attributes ?? []).map((a: any) => [String(a.name ?? "").toLowerCase(), cleanText(a.option, 30)] as const);
        const size = attrs.find(([key]) => /size/.test(key))?.[1] || null;
        const color = attrs.find(([key]) => /color|colour/.test(key))?.[1] || null;
        const remoteVariantId = String(wcVariant.id);
        const existing = await prisma.productVariant.findFirst({ where: { productId: product.id, wooCommerceVariationId: remoteVariantId } });
        const variant = existing
          ? await prisma.productVariant.update({ where: { id: existing.id }, data: { size, color, sku: cleanText(wcVariant.sku, 80) || null, price: Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : null } })
          : await prisma.productVariant.create({ data: { productId: product.id, wooCommerceVariationId: remoteVariantId, size, color, sku: cleanText(wcVariant.sku, 80) || null, price: Number.isFinite(variantPrice) && variantPrice > 0 && variantPrice !== basePrice ? variantPrice : null } });
        await prisma.inventory.upsert({
          where: { branchId_variantId: { branchId: branch.id, variantId: variant.id } },
          create: { branchId: branch.id, variantId: variant.id, quantity: Number.isInteger(wcVariant.stock_quantity) ? Math.max(0, wcVariant.stock_quantity) : 0 },
          update: {},
        });
      }
      productsUpdated++;
    }

    // Only paid, fulfillable orders enter POS sales. The unique externalOrderId
    // makes repeated manual syncs idempotent.
    const orders = await fetchPages(client, "orders", { status: "processing,completed" });
    let ordersImported = 0;
    let ordersSkipped = 0;
    for (const order of orders) {
      const remoteId = String(order.id);
      if (!remoteId || await prisma.sale.findFirst({ where: { organizationId, externalOrderId: remoteId }, select: { id: true } })) continue;
      const lines: { variantId: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
      let invalidLine = false;
      for (const item of order.line_items ?? []) {
        const product = await prisma.product.findFirst({ where: { organizationId, wooCommerceId: String(item.product_id) }, select: { id: true, basePrice: true } });
        if (!product) { invalidLine = true; break; }
        const variant = await prisma.productVariant.findFirst({
          where: { productId: product.id, wooCommerceVariationId: String(item.variation_id || item.product_id) },
          include: { inventory: { where: { branchId: branch.id } } },
        });
        if (!variant || !Number.isInteger(item.quantity) || item.quantity < 1) { invalidLine = true; break; }
        const unitPrice = Number(item.total || 0) / item.quantity;
        lines.push({ variantId: variant.id, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity });
      }
      if (invalidLine || !lines.length) { ordersSkipped++; continue; }
      const subtotal = Number(order.subtotal || order.total);
      const total = Number(order.total);
      if (!Number.isFinite(subtotal) || !Number.isFinite(total) || total <= 0) { ordersSkipped++; continue; }
      try {
        await prisma.$transaction(async (tx) => {
          const sale = await tx.sale.create({
            data: {
              organizationId, branchId: branch.id, userId: actorUserId,
              externalOrderId: remoteId, status: "COMPLETED", subtotal, total,
              items: { create: lines },
              payments: { create: { method: /mpesa|m-pesa/i.test(String(order.payment_method ?? "")) ? "MPESA" : "CARD", status: "SUCCESS", amount: total } },
            },
          });
          // On initial sync WooCommerce stock already reflects its historical
          // orders. Deduct only online orders arriving after the first import.
          if (!firstSync) for (const line of lines) {
            await applyStockChange(organizationId, branch.id, line.variantId, actorUserId, "SALE", -line.quantity, `WooCommerce order ${remoteId}`, tx);
          }
          return sale;
        });
        ordersImported++;
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") continue;
        ordersSkipped++;
      }
    }
    await markSynced(organizationId);
    return { productsUpdated, ordersImported, ordersSkipped, syncedAt: new Date().toISOString() };
  } catch (error) { externalError(error); }
}
