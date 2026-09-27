import { Request } from "express";
import { forbidden } from "../utils/errors";

// Employees are confined to their assigned branch, even if they edit request
// parameters manually. Managers and owners may choose any branch in their org.
export function branchForRequest(req: Request, requestedBranchId?: string): string | undefined {
  const auth = req.auth!;
  if (auth.role === "EMPLOYEE") {
    if (!auth.branchId) throw forbidden("Your account is not assigned to a branch");
    if (requestedBranchId && requestedBranchId !== auth.branchId) throw forbidden("You can only access your assigned branch");
    return auth.branchId;
  }
  return requestedBranchId;
}
