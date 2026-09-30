import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { setSessionCookie, clearSessionCookie, COOKIE_NAME, readSessionId } from "../../utils/session";
import { registerOrgSchema, loginSchema, inviteUserSchema } from "./auth.schemas";
import * as AuthService from "./auth.service";
import { requireCurrentSubscription } from "../../middleware/subscription";
import { loginRateLimit } from "../../middleware/loginRateLimit";

export const authRouter = Router();

// POST /api/auth/register  — SaaS sign-up: creates a new Organization + Owner
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerOrgSchema.parse(req.body);
    const { user, sessionId } = await AuthService.registerOrganization(input);
    setSessionCookie(res, sessionId);
    res.status(201).json({ user: AuthService.publicUser(user) });
  })
);

// POST /api/auth/login
authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, sessionId } = await AuthService.login(input.identifier, input.password);
    setSessionCookie(res, sessionId);
    res.json({ user: AuthService.publicUser(user) });
  })
);

// POST /api/auth/logout
authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const sessionId = readSessionId(req.cookies?.[COOKIE_NAME]);
    if (sessionId) await AuthService.logout(sessionId);
    clearSessionCookie(res);
    res.status(204).send();
  })
);

// GET /api/auth/me
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      select: { id: true, name: true, email: true, role: true, organizationId: true, branchId: true },
    });
    res.json({ user: AuthService.publicUser(user) });
  })
);

// POST /api/auth/users — Owner/Manager invites a new employee/manager
authRouter.post(
  "/users",
  requireAuth,
  requireRole("OWNER", "MANAGER"),
  requireCurrentSubscription,
  asyncHandler(async (req, res) => {
    const input = inviteUserSchema.parse(req.body);
    const user = await AuthService.inviteUser(req.auth!.organizationId, input);
    res.status(201).json({ user: AuthService.publicUser(user) });
  })
);

// GET /api/auth/users — list org's users (owner/manager)
authRouter.get(
  "/users",
  requireAuth,
  requireRole("OWNER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ users: users.map(AuthService.publicUser) });
  })
);
