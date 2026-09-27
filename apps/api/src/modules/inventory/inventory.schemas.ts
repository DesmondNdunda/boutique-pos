import { z } from "zod";

export const restockSchema = z.object({
  variantId: z.string().cuid(),
  branchId: z.string().cuid(),
  quantity: z.coerce.number().int().positive(),
  note: z.string().max(300).optional(),
});

export const adjustSchema = z.object({
  variantId: z.string().cuid(),
  branchId: z.string().cuid(),
  // Signed delta: positive corrects up, negative corrects down (e.g. damage/loss).
  quantityChange: z.coerce.number().int().refine((n) => n !== 0, "quantityChange cannot be 0"),
  reason: z.enum(["ADJUSTMENT", "DAMAGE", "RETURN", "TRANSFER"]),
  note: z.string().max(300).optional(),
});
