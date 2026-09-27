# Boutique POS â€” Multi-tenant SaaS Point of Sale

A clothing-store POS you can sell with to multiple boutiques (organizations),
each with isolated data. Responsive PWA â€” works on PC, Android and iPhone
from one codebase.

## Stack

- **apps/api** â€” Express + TypeScript + Prisma + PostgreSQL. Session auth
  (argon2 + DB-backed signed cookies), RBAC enforced server-side, real
  M-Pesa Daraja STK Push integration.
- **apps/web** â€” React + Vite + TypeScript + Tailwind, installable PWA,
  React Query + Zustand.
- **packages/shared** â€” shared TypeScript types.

## 1. Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable` then `corepack prepare pnpm@9.12.0 --activate`)
- A Postgres database â€” Supabase recommended (free tier works for dev)
- A Safaricom Daraja developer account for M-Pesa (sandbox is free): https://developer.safaricom.co.ke

## 2. Setup

```bash
pnpm install
cp .env.example .env
cp .env apps/api/.env
```

The API package and Prisma CLI run from `apps/api`, so keep a copy of the
environment file there as well. Update both copies when changing credentials.

Edit `.env`:

- **DATABASE_URL / DIRECT_URL** â€” open Supabase **Connect â†’ ORM â†’ Prisma** and
  copy the connection strings. For an IPv4-only network, use the Transaction
  pooler URI (port `6543`, with `pgbouncer=true`) for `DATABASE_URL`, and the
  Session pooler URI (port `5432`) for `DIRECT_URL`. The Prisma schema uses
  `DIRECT_URL` for migrations. URL-encode special characters in the password.
- **SESSION_SECRET** â€” generate with `openssl rand -hex 32`.
- **MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET** â€” copy the sandbox app's
  Consumer Key and Consumer Secret into your local `.env`. Never commit these
  values or put them in frontend code.
- **MPESA_SHORTCODE / MPESA_PASSKEY** â€” the screenshot shows `N/A` for both.
  For sandbox, use shortcode `174379` and the sandbox Lipa Na M-Pesa Online
  passkey supplied by Daraja. For production, use the shortcode and passkey
  provisioned for your live Paybill or Till. The consumer key and secret alone
  are not enough to initiate an STK Push.
- **MPESA_CALLBACK_URL** â€” must be a public HTTPS URL. For local dev, run
  `ngrok http 4000` and set this to `https://<your-ngrok-id>.ngrok-free.app/api/payments/mpesa/callback`.
- **MPESA_TRANSACTION_TYPE** â€” `CustomerPayBillOnline` for a Paybill or
  `CustomerBuyGoodsOnline` for a Daraja-enabled Till. Check readiness and OAuth
  connectivity while signed in as an owner/manager at `GET /api/payments/mpesa/status`.

Stripe billing setup: create recurring Basic and Pro prices, set
`STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_ID`, and `STRIPE_PRO_PRICE_ID`, and
register `/api/billing/webhook` for `checkout.session.completed`,
`customer.subscription.updated`, and `customer.subscription.deleted`. Store
the signing secret as `STRIPE_WEBHOOK_SECRET`; use test-mode values locally.
Development photo uploads are saved under `apps/api/uploads`. Production
uploads require a public Supabase Storage bucket and the `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` settings.

Then generate the Prisma client and apply database migrations:

```bash
pnpm prisma:generate
pnpm prisma:migrate      # creates tables in your Supabase DB
pnpm seed                # optional: Ashler Trends org + users + products
```

Seed creates:
- Owner login: `Amina` / `password123` (email also works)
- Sales employee login: `Desmond` / `password123` (email also works)

## 3. Run locally

```bash
pnpm dev:api     # http://localhost:4000
pnpm dev:web     # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173 â€” either log in with the seeded demo account, or
click "Create your store" to sign up a fresh organization (this is the SaaS
sign-up flow: it provisions a new Organization + Owner + Main Branch).

## Install Ashler Trends on Windows or a phone

The web app is also a Progressive Web App (PWA). Deploy the web and API behind
the same HTTPS domain before installing it; the local `localhost` development
address and a LAN address are for testing and are not installable on phones as
an app. The deployed app and its database must stay online for devices to share
the same products, stock, and sales.

- **Windows:** open the HTTPS app in Microsoft Edge, select the menu, then
  **Apps â†’ Install this site as an app**.
- **Android:** open the HTTPS app in Chrome, select the menu, then **Install
  app** or **Add to Home screen**.
- **iPhone:** open the HTTPS app in Safari, tap **Share**, then **Add to Home
  Screen**.

Each device installs the same Ashler Trends app from its secure web address;
there is no single `.exe` or `.apk` that installs on every platform. POS
transactions still require an internet connection to reach the shared API.

## 4. How the M-Pesa flow works

1. Employee builds a cart on the Sell screen and picks M-Pesa.
2. The API creates a `Sale` with status `PENDING_PAYMENT` and calls Daraja's
   STK Push endpoint â€” this pops a PIN prompt on the customer's phone.
3. The frontend polls `GET /api/sales/:id/status` every 3s.
4. Safaricom calls `POST /api/payments/mpesa/callback` (unauthenticated by
   necessity â€” that's Safaricom's server talking to yours) with the result.
5. On success, the API marks the `Sale` and `Payment` as complete **and only
   then** deducts stock â€” this is the one and only place M-Pesa stock is
   decremented, so a customer who never completes the prompt never has
   stock silently vanish.

CASH and CARD sales are synchronous â€” stock is deducted immediately at
checkout.

## 5. Deployment (Docker)

```bash
docker compose build
docker compose up -d
```

`docker-compose.yml` includes a local Postgres container for convenience,
but if you're using Supabase, just point `DATABASE_URL`/`DIRECT_URL` in
`.env` at Supabase and you can drop the `postgres` service.

For a typical split deployment (recommended over the bundled nginx setup):
- **API** â†’ Railway / Render / a VPS running `infra/Dockerfile.api`
- **Web** â†’ Vercel / Netlify (static build: `pnpm --filter @boutique-pos/web build`, output `apps/web/dist`) â€” remove the `/api/` proxy block from `infra/nginx.conf` and instead set the frontend's API calls to hit the API's public URL (update `apps/web/src/lib/api.ts` baseURL and the API's CORS `WEB_BASE_URL` env var accordingly).

The GitHub Actions workflow at `.github/workflows/ci.yml` builds both apps
on every push/PR â€” wire it to your deploy target of choice (Railway/Render
both support "deploy on push" without needing custom Actions).

## 6. What's implemented

**Working now:** tenant-scoped accounts and data, 14-day trials with read-only access after expiry, Owner/Manager/Employee roles, branch switching, products with variants and photo uploads, audited restocking and branch transfers, checkout for cash/card/M-Pesa, dashboard, date-filtered sales reports with CSV export, team management, Stripe subscriptions and billing portal, PWA installability, and responsive layouts.

Stripe checkout and subscription updates require the webhook to be reachable from Stripe. The webhook verifies Stripe signatures before changing plan records. Plan prices and billing intervals come from recurring Stripe prices you configure; the app does not hard-code pricing.

## 7. Local development notes

The API and web app can run without Stripe or Supabase credentials. Stripe billing needs Stripe configuration; development photo uploads use local storage, while production photo uploads need Supabase. A PostgreSQL database is required for sign-in and POS operations.
