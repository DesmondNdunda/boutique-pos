import express from "express";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { attachSession } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import { authRouter } from "./modules/auth/auth.routes";
import { productsRouter } from "./modules/products/products.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { paymentsRouter, paymentAdminRouter } from "./modules/payments/payments.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { branchesRouter, orgRouter } from "./modules/organizations/branches.routes";
import { billingRouter, handleStripeWebhook } from "./modules/billing/billing.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.webBaseUrl, credentials: true }));
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(cookieParser());
// Development-only local photo storage; production uploads use Supabase Storage.
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d", immutable: true }));

// The M-Pesa callback route needs raw JSON before our general session logic
// runs (Safaricom sends no cookies), so it is mounted separately and does NOT
// go through attachSession.
app.use("/api/payments", express.json(), paymentsRouter);

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    await handleStripeWebhook(req.body as Buffer, req.header("stripe-signature"));
    res.json({ received: true });
  } catch (error) { next(error); }
});

app.use(express.json({ limit: "7mb" }));
app.use(attachSession);

app.get("/api/health", (_req, res) => res.json({ ok: true, env: env.nodeEnv }));

app.use("/api/auth", authRouter);
app.use("/api/organizations", orgRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/products", productsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sales", salesRouter);
app.use("/api/payments", paymentAdminRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/billing", billingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
