import { z } from "zod";

const variantInput = z.object({
  size: z.string().trim().max(30).optional().nullable(),
  color: z.string().trim().max(30).optional().nullable(),
  price: z.coerce.number().positive().optional(), // overrides base price
  initialStock: z.coerce.number().int().min(0).default(0),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().cuid().optional(),
  basePrice: z.coerce.number().positive(),
  imageUrl: z.string().url().optional(),
  hasVariants: z.boolean().default(true),
  // If hasVariants=false, send a single variant with size/color = null.
  variants: z.array(variantInput).min(1),
  branchId: z.string().cuid(), // which branch initial stock is added to
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.string().cuid().optional().nullable(),
  basePrice: z.coerce.number().positive().optional(),
  imageUrl: z.string().url().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const addVariantSchema = variantInput.extend({
  branchId: z.string().cuid(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
});
