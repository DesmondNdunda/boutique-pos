import { z } from "zod";

export const registerOrgSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1),
});

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
  role: z.enum(["MANAGER", "EMPLOYEE"]),
  branchId: z.string().cuid().optional(),
});
