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
  const message = env.nodeEnv === "development" && err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ error: message });
};

export const notFoundHandler = (_req: any, res: any) => {
  res.status(404).json({ error: "Route not found" });
};
