import { z } from "zod";

export const checkoutSchema = z.object({
  branchId: z.string().cuid(),
  items: z
    .array(
      z.object({
        variantId: z.string().cuid(),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
  paymentMethod: z.enum(["CASH", "MPESA", "CARD"]),
  phoneNumber: z.string().trim().min(9).max(20).optional(), // required if MPESA
});
