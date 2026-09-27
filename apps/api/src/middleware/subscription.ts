import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";

// Keep tenant data readable after expiry while preventing new commercial writes.
export const requireCurrentSubscription = asyncHandler(async (req, _res, next) => {
  const organization = await prisma.organization.findUnique({
    where: { id: req.auth!.organizationId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  if (!organization) throw new AppError(404, "Store not found");
  const trialValid = organization.subscriptionStatus === "TRIALING" && organization.trialEndsAt !== null && organization.trialEndsAt > new Date();
  if (organization.subscriptionStatus !== "ACTIVE" && !trialValid) {
    throw new AppError(402, "Your trial or subscription has ended. Choose a plan in Billing to resume store operations.");
  }
  next();
});
