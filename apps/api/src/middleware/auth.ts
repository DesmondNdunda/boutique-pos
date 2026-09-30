import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { COOKIE_NAME, readSessionId } from "../utils/session";
import { unauthorized } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";

// Augment Express Request with the authenticated user's context.
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        branchId: string | null;
        role: "OWNER" | "MANAGER" | "EMPLOYEE";
      };
    }
  }
}

// Populates req.auth if a valid session cookie is present. Never throws —
// use `requireAuth` after this if the route must be protected.
export const attachSession = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const sessionId = readSessionId(req.cookies?.[COOKIE_NAME]);
  if (!sessionId) return next();

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, organizationId: true, branchId: true, role: true, isActive: true } } },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return next();
  }

  // Older employee accounts may predate branch assignment. Attach them to
  // the store's main branch so their branch-scoped catalogue and stock load.
  let branchId = session.user.branchId;
  if (session.user.role === "EMPLOYEE" && !branchId) {
    const mainBranch = await prisma.branch.findFirst({
      where: { organizationId: session.user.organizationId, isMain: true },
      select: { id: true },
    });
    if (mainBranch) {
      branchId = mainBranch.id;
      await prisma.user.update({ where: { id: session.user.id }, data: { branchId } });
    }
  }

  req.auth = {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    branchId,
    role: session.user.role,
  };
  next();
});

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized("You must be signed in");
  next();
}
