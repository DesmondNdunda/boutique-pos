import { Router } from "express";
import * as Mpesa from "./mpesa.service";
import * as SalesService from "../sales/sales.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireRole } from "../../middleware/rbac";

// NOTE: this router is mounted WITHOUT requireAuth — Safaricom's servers
// call the callback URL directly and cannot send our session cookie. Trust
// is instead established by keeping MPESA_CALLBACK_URL secret/unguessable
// and, in production, optionally allow-listing Safaricom's IP ranges at the
// load balancer / reverse proxy level.
export const paymentsRouter = Router();
export const paymentAdminRouter = Router();

paymentAdminRouter.get("/mpesa/status", requireRole("OWNER", "MANAGER"), asyncHandler(async (_req, res) => {
  const config = Mpesa.getMpesaConfiguration();
  let connected = false;
  let connectionMessage: string | undefined;
  if (config.configured) {
    try { await Mpesa.checkMpesaConnection(); connected = true; }
    catch (error) { connectionMessage = error instanceof Error ? error.message : "M-Pesa connection failed"; }
  }
  res.json({ ...config, connected, connectionMessage });
}));

// POST /api/payments/mpesa/callback — Safaricom posts the STK push result here.
paymentsRouter.post(
  "/mpesa/callback",
  asyncHandler(async (req, res) => {
    const parsed = Mpesa.parseCallback(req.body);
    await SalesService.confirmMpesaPayment(parsed);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  })
);
