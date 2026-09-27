import { Request, Response, NextFunction } from "express";
import { forbidden } from "../utils/errors";

type Role = "OWNER" | "MANAGER" | "EMPLOYEE";

// Usage: router.post("/products", requireRole("OWNER", "MANAGER"), handler)
// This is the ENFORCEMENT layer — the frontend hides buttons for UX only.
// Every state-changing route must be gated here, never by the client alone.
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(forbidden("Not authenticated"));
    if (!allowed.includes(req.auth.role)) {
      return next(forbidden(`Requires role: ${allowed.join(" or ")}`));
    }
    next();
  };
}
