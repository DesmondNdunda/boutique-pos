import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError, badRequest } from "../../utils/errors";

export const billingRouter = Router();
billingRouter.use(requireAuth);

async function stripePost(path: string, values: Record<string, string>) {
  if (!env.stripe.secretKey) throw new AppError(503, "Stripe billing is not configured");
  const body = new URLSearchParams(values);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${env.stripe.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const result = await response.json() as any;
  if (!response.ok) throw new AppError(502, result?.error?.message ?? "Stripe request failed");
  return result;
}

billingRouter.post("/checkout", requireRole("OWNER"), asyncHandler(async (req, res) => {
  const { plan } = z.object({ plan: z.enum(["BASIC", "PRO"]) }).parse(req.body);
  const priceId = plan === "BASIC" ? env.stripe.basicPriceId : env.stripe.proPriceId;
  if (!priceId) throw new AppError(503, `Stripe price for ${plan} is not configured`);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId }, include: { users: { where: { role: "OWNER" }, take: 1 } } });
  if (org.stripeSubscriptionId) throw badRequest("Use the billing portal to change an existing subscription");
  const values: Record<string, string> = {
    mode: "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
    success_url: `${env.webBaseUrl}/billing?checkout=success`, cancel_url: `${env.webBaseUrl}/billing?checkout=cancelled`,
    client_reference_id: org.id, "metadata[organizationId]": org.id, "metadata[plan]": plan,
    "subscription_data[metadata][organizationId]": org.id, "subscription_data[metadata][plan]": plan,
  };
  if (org.stripeCustomerId) values.customer = org.stripeCustomerId;
  else if (org.users[0]?.email) values.customer_email = org.users[0].email;
  const session = await stripePost("checkout/sessions", values);
  res.json({ url: session.url });
}));

billingRouter.post("/portal", requireRole("OWNER"), asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
  if (!org.stripeCustomerId) throw badRequest("No billing account is linked yet");
  const session = await stripePost("billing_portal/sessions", { customer: org.stripeCustomerId, return_url: `${env.webBaseUrl}/billing` });
  res.json({ url: session.url });
}));

// Mounted before session middleware and JSON parsing; Stripe signs the exact raw bytes.
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!env.stripe.webhookSecret || !signature) throw new AppError(400, "Invalid Stripe webhook signature");
  const parts = signature.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new AppError(400, "Expired Stripe webhook signature");
  const expected = createHmac("sha256", env.stripe.webhookSecret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (!signatures.some((item) => { const candidate = Buffer.from(item, "hex"); return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer); })) throw new AppError(400, "Invalid Stripe webhook signature");

  const event = JSON.parse(rawBody.toString("utf8"));
  const object = event.data?.object;
  if (event.type === "checkout.session.completed" && object?.mode === "subscription") {
    const organizationId = object.metadata?.organizationId ?? object.client_reference_id;
    const plan = object.metadata?.plan;
    if (organizationId && (plan === "BASIC" || plan === "PRO")) await prisma.organization.updateMany({
      where: { id: organizationId }, data: { stripeCustomerId: String(object.customer), stripeSubscriptionId: String(object.subscription), subscriptionPlan: plan, subscriptionStatus: "ACTIVE", trialEndsAt: null },
    });
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const organizationId = object.metadata?.organizationId;
    const plan = object.metadata?.plan;
    const statuses: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING"> = { active: "ACTIVE", past_due: "PAST_DUE", unpaid: "PAST_DUE", canceled: "CANCELED", trialing: "TRIALING" };
    if (organizationId && statuses[object.status]) await prisma.organization.updateMany({
      where: { id: organizationId }, data: {
        stripeCustomerId: String(object.customer), stripeSubscriptionId: event.type === "customer.subscription.deleted" ? null : String(object.id),
        subscriptionStatus: event.type === "customer.subscription.deleted" ? "CANCELED" : statuses[object.status],
        ...(plan === "BASIC" || plan === "PRO" ? { subscriptionPlan: plan } : {}),
      },
    });
  }
}
