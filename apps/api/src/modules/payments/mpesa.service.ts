import axios from "axios";
import { env } from "../../config/env";
import { AppError, badRequest } from "../../utils/errors";

const BASE_URL =
  env.mpesa.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

let cachedToken: { token: string; expiresAt: number } | null = null;

// OAuth token, cached until ~60s before expiry (Daraja tokens last 1hr).
async function getAccessToken(): Promise<string> {
  if (!env.mpesa.consumerKey || !env.mpesa.consumerSecret) {
    throw new AppError(503,
      "M-Pesa is not configured — set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY and MPESA_CALLBACK_URL in .env"
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const auth = Buffer.from(`${env.mpesa.consumerKey}:${env.mpesa.consumerSecret}`).toString("base64");
  let data: any;
  try {
    ({ data } = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` }, timeout: 15000,
    }));
  } catch (error) {
    const detail = axios.isAxiosError(error) ? (error.response?.data as any)?.error_description : undefined;
    throw new AppError(502, `Could not authenticate with M-Pesa${detail ? `: ${String(detail).slice(0, 180)}` : ". Check Daraja credentials and environment."}`);
  }
  if (typeof data?.access_token !== "string") throw new AppError(502, "M-Pesa did not return an access token");

  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000 };
  return cachedToken.token;
}

function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

export function getMpesaConfiguration() {
  const missing: string[] = [];
  if (!env.mpesa.consumerKey) missing.push("MPESA_CONSUMER_KEY");
  if (!env.mpesa.consumerSecret) missing.push("MPESA_CONSUMER_SECRET");
  if (!env.mpesa.shortcode) missing.push("MPESA_SHORTCODE");
  if (!env.mpesa.passkey) missing.push("MPESA_PASSKEY");
  let callbackConfigured = false;
  try {
    const url = new URL(env.mpesa.callbackUrl);
    callbackConfigured = url.protocol === "https:" && !/(example|localhost|127\.0\.0\.1|\.test)/i.test(url.hostname) && url.pathname.endsWith("/api/payments/mpesa/callback");
  } catch { /* not configured */ }
  if (!callbackConfigured) missing.push("MPESA_CALLBACK_URL (public HTTPS callback URL required)");
  return { environment: env.mpesa.env, configured: missing.length === 0, callbackConfigured, missing };
}

export async function checkMpesaConnection() { return getAccessToken(); }

function password(ts: string): string {
  return Buffer.from(`${env.mpesa.shortcode}${env.mpesa.passkey}${ts}`).toString("base64");
}

// Normalizes local/international Kenyan numbers to the 2547XXXXXXXX format Daraja requires.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("254")
    ? digits
    : digits.startsWith("0")
      ? `254${digits.slice(1)}`
      : digits.startsWith("7") || digits.startsWith("1")
        ? `254${digits}`
        : "";
  if (/^254[71]\d{8}$/.test(normalized)) return normalized;
  throw badRequest(`Invalid phone number: ${phone}`);
}

// Initiates an STK Push ("Lipa na M-Pesa Online") prompt on the customer's phone.
export async function stkPush(params: {
  phone: string;
  amount: number;
  accountReference: string; // e.g. Sale ID — shows on the customer's prompt
  description: string;
}) {
  const config = getMpesaConfiguration();
  if (!config.configured) throw new AppError(503, `M-Pesa is not ready: ${config.missing.join(", ")}`);
  if (!Number.isSafeInteger(params.amount) || params.amount < 1) throw badRequest("M-Pesa amount must be a whole number of at least KSh 1");
  const token = await getAccessToken();
  const ts = timestamp();
  const msisdn = normalizePhone(params.phone);

  let data: any;
  try { ({ data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: env.mpesa.shortcode,
      Password: password(ts),
      Timestamp: ts,
      TransactionType: env.mpesa.transactionType,
      Amount: params.amount,
      PartyA: msisdn,
      PartyB: env.mpesa.shortcode,
      PhoneNumber: msisdn,
      CallBackURL: env.mpesa.callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.description.slice(0, 13),
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
  )); } catch (error) {
    const message = axios.isAxiosError(error) ? (error.response?.data as any)?.errorMessage : undefined;
    throw new AppError(502, `M-Pesa STK request failed${message ? `: ${String(message).slice(0, 180)}` : ". Check shortcode, passkey and Daraja app configuration."}`);
  }

  // { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage }
  if (String(data?.ResponseCode) !== "0" || !data?.CheckoutRequestID || !data?.MerchantRequestID) {
    throw new AppError(502, `M-Pesa rejected the payment request: ${String(data?.ResponseDescription ?? data?.errorMessage ?? "invalid response")}`);
  }
  return data as {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
  };
}

// Optional: actively poll status instead of waiting for the callback (useful
// if the callback URL is briefly unreachable).
export async function stkQuery(checkoutRequestId: string) {
  const token = await getAccessToken();
  const ts = timestamp();
  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: env.mpesa.shortcode,
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

// Shape of the payload Safaricom POSTs to MPESA_CALLBACK_URL.
export interface MpesaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: { Name: string; Value?: string | number }[];
      };
    };
  };
}

export function parseCallback(body: MpesaCallbackBody) {
  if (!body || typeof body !== "object" || !body.Body?.stkCallback) throw badRequest("Invalid M-Pesa callback payload");
  const cb = body.Body.stkCallback;
  if (typeof cb.CheckoutRequestID !== "string" || !cb.CheckoutRequestID || !Number.isInteger(cb.ResultCode)) throw badRequest("Invalid M-Pesa callback identifiers");
  const items = cb.CallbackMetadata?.Item ?? [];
  const get = (name: string) => items.find((i) => i.Name === name)?.Value;

  return {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    success: cb.ResultCode === 0,
    resultDesc: cb.ResultDesc,
    amount: get("Amount") as number | undefined,
    mpesaReceiptNumber: get("MpesaReceiptNumber") as string | undefined,
    phoneNumber: get("PhoneNumber") ? String(get("PhoneNumber")) : undefined,
  };
}
