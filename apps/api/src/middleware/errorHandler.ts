import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";
import { env } from "../config/env";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  const prismaError = err as { name?: string; code?: string; message?: string };
  const databaseUnavailable = prismaError?.name === "PrismaClientInitializationError"
    || prismaError?.code === "P1001"
    || /can't reach database server|econnrefused/i.test(prismaError?.message ?? "");
  if (databaseUnavailable) {
    const message = env.nodeEnv === "development"
      ? "Database unavailable. Start local PostgreSQL with `docker compose up -d postgres`, then try again."
      : "Service temporarily unavailable. Please try again shortly.";
    return res.status(503).json({ error: message });
  }
  const message = env.nodeEnv === "development" && err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ error: message });
};

export const notFoundHandler = (_req: any, res: any) => {
  res.status(404).json({ error: "Route not found" });
};
