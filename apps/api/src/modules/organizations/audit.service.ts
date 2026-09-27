import { prisma } from "../../lib/prisma";

// Fire-and-forget style audit trail. Called after every state-changing
// action an Owner/Manager performs (product/inventory/settings changes).
export async function logAction(
  organizationId: string,
  userId: string | null,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, any>
) {
  await prisma.auditLog.create({
    data: { organizationId, userId, action, entityType, entityId, metadata },
  });
}
