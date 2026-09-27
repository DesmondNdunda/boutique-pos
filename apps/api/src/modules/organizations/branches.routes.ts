import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireCurrentSubscription } from "../../middleware/subscription";

export const branchesRouter = Router();
branchesRouter.use(requireAuth);

branchesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const branches = await prisma.branch.findMany({ where: { organizationId: req.auth!.organizationId, ...(req.auth!.role === "EMPLOYEE" ? { id: req.auth!.branchId ?? "" } : {}) } });
    res.json({ branches });
  })
);

branchesRouter.post(
  "/",
  requireRole("OWNER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const { name, address } = z.object({ name: z.string().min(1), address: z.string().optional() }).parse(req.body);
    const branch = await prisma.branch.create({ data: { organizationId: req.auth!.organizationId, name, address } });
    res.status(201).json({ branch });
  })
);

// GET /api/organizations/me — current org's profile + subscription status
export const orgRouter = Router();
orgRouter.use(requireAuth);
orgRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } });
    res.json({ organization: org });
  })
);

orgRouter.get(
  "/audit-logs",
  requireRole("OWNER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ logs });
  })
);
