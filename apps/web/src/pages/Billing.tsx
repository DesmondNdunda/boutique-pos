import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

const label: Record<string, string> = { TRIAL: "Free trial", BASIC: "Basic", PRO: "Pro" };

export function Billing() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const { data, isLoading, refetch } = useQuery({ queryKey: ["organization"], queryFn: async () => (await api.get("/organizations/me")).data.organization, refetchInterval: (query) => params.get("checkout") === "success" && query.state.data?.subscriptionStatus === "TRIALING" ? 2500 : false });

  async function checkout(plan: "BASIC" | "PRO") {
    setError(""); setBusy(plan);
    try { const response = await api.post("/billing/checkout", { plan }); window.location.assign(response.data.url); }
    catch (e: any) { setError(e.message); setBusy(""); }
  }
  async function portal() {
    setError(""); setBusy("portal");
    try { const response = await api.post("/billing/portal"); window.location.assign(response.data.url); }
    catch (e: any) { setError(e.message); setBusy(""); }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading billing…</p>;
  const isOwner = user?.role === "OWNER";
  const daysLeft = data?.trialEndsAt ? Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / 86400000)) : 0;
  return <div className="mx-auto max-w-3xl space-y-5">
    <div><h1 className="text-xl font-semibold">Plan and billing</h1><p className="text-sm text-slate-500">Manage the subscription for {data?.name}.</p></div>
    {params.get("checkout") === "success" && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Checkout completed. Subscription status syncs from Stripe shortly. <button className="underline" onClick={() => refetch()}>Refresh</button></div>}
    {params.get("checkout") === "cancelled" && <div className="rounded-lg bg-slate-100 p-3 text-sm">Checkout was cancelled; your current plan is unchanged.</div>}
    <section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">Current plan</p><h2 className="mt-1 text-2xl font-semibold">{label[data?.subscriptionPlan] ?? data?.subscriptionPlan}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{data?.subscriptionStatus}</span></div>
      {data?.subscriptionPlan === "TRIAL" && <p className="mt-3 text-sm text-slate-600">{daysLeft > 0 ? `${daysLeft} days remain in your 14-day trial.` : "Your trial has ended."}</p>}
      {data?.subscriptionStatus === "PAST_DUE" && <p className="mt-3 text-sm text-amber-700">Payment needs attention. Update your payment method in the billing portal.</p>}
      {data?.subscriptionStatus === "CANCELED" && <p className="mt-3 text-sm text-slate-600">Your subscription is canceled. Choose a plan below to restart.</p>}
      {isOwner && data?.stripeCustomerId && <button onClick={portal} disabled={!!busy} className="mt-4 rounded-md border px-4 py-2 text-sm disabled:opacity-50">{busy === "portal" ? "Opening…" : "Manage subscription, payment, and invoices"}</button>}
    </section>
    {isOwner && !data?.stripeSubscriptionId && <section><h2 className="mb-3 font-semibold">Choose a plan</h2><div className="grid gap-3 sm:grid-cols-2">{(["BASIC", "PRO"] as const).map((plan) => <div key={plan} className="rounded-xl border bg-white p-5"><h3 className="text-lg font-semibold">{label[plan]}</h3><p className="mt-2 text-sm text-slate-500">Subscription price and billing interval are managed in your Stripe account.</p><button onClick={() => checkout(plan)} disabled={!!busy} className="mt-5 w-full rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">{busy === plan ? "Opening secure checkout…" : `Subscribe to ${label[plan]}`}</button></div>)}</div></section>}
    {isOwner && data?.stripeSubscriptionId && <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">To change or cancel your active plan, use the Stripe billing portal above. Enable subscription updates in your Stripe customer portal configuration.</p>}
    {!isOwner && <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">Only the store owner can change the plan.</p>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>;
}
