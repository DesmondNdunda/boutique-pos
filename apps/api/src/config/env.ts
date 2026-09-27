import "dotenv/config";

function get(key: string, fallback?: string): string {
  return process.env[key] ?? fallback ?? "";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  apiBaseUrl: get("API_BASE_URL", "http://localhost:4000"),
  webBaseUrl: get("WEB_BASE_URL", "http://localhost:5173"),
  sessionSecret: get("SESSION_SECRET", "dev-secret-change-me"),
  cookieDomain: process.env.COOKIE_DOMAIN,

  mpesa: {
    env: process.env.MPESA_ENV ?? "sandbox",
    consumerKey: get("MPESA_CONSUMER_KEY"),
    consumerSecret: get("MPESA_CONSUMER_SECRET"),
    shortcode: get("MPESA_SHORTCODE", "174379"),
    passkey: get("MPESA_PASSKEY"),
    callbackUrl: get("MPESA_CALLBACK_URL"),
    transactionType: get("MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline"),
  },

  supabase: {
    url: get("SUPABASE_URL"),
    serviceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "product-images",
  },
  stripe: {
    secretKey: get("STRIPE_SECRET_KEY"),
    webhookSecret: get("STRIPE_WEBHOOK_SECRET"),
    basicPriceId: get("STRIPE_BASIC_PRICE_ID"),
    proPriceId: get("STRIPE_PRO_PRICE_ID"),
  },
};

export const isProd = env.nodeEnv === "production";
