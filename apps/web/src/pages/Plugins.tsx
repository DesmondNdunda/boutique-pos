import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

type Gateway = { id: string; title: string; description: string; enabled: boolean; methodTitle: string };

function wordpressPluginUploadUrl(storeUrl: string) {
  try {
    const url = new URL(storeUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return undefined;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/wp-admin/plugin-install.php`;
    url.search = "?tab=upload";
    url.hash = "";
    return url.toString();
  } catch { return undefined; }
}

export function Plugins() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const connection = useQuery({
    queryKey: ["woocommerce-connection"],
    queryFn: async () => (await api.get("/integrations/woocommerce")).data,
  });
  const connected = Boolean(connection.data?.connected);
  const wordpressUrl = connected ? connection.data.storeUrl : storeUrl;
  const pluginUploadUrl = wordpressPluginUploadUrl(wordpressUrl);
  const gateways = useQuery({
    queryKey: ["woocommerce-gateways"],
    queryFn: async () => (await api.get("/integrations/woocommerce/gateways")).data.gateways as Gateway[],
    enabled: connected && user?.role === "OWNER",
  });

  const connect = useMutation({
    mutationFn: async () => (await api.post("/integrations/woocommerce/connect", { storeUrl, consumerKey, consumerSecret })).data,
    onSuccess: async () => {
      setConsumerKey(""); setConsumerSecret("");
      await queryClient.invalidateQueries({ queryKey: ["woocommerce-connection"] });
      await queryClient.invalidateQueries({ queryKey: ["woocommerce-gateways"] });
    },
  });
  const sync = useMutation({
    mutationFn: async () => (await api.post("/integrations/woocommerce/sync")).data.result,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["woocommerce-connection"] }); },
  });
  const changeGateway = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/integrations/woocommerce/gateways/${encodeURIComponent(id)}`, { enabled }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["woocommerce-gateways"] }); },
  });
  const disconnect = useMutation({
    mutationFn: async () => api.delete("/integrations/woocommerce"),
    onSuccess: async () => {
      setDisconnectOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["woocommerce-connection"] });
      await queryClient.invalidateQueries({ queryKey: ["woocommerce-gateways"] });
    },
  });

  const error = connect.error || sync.error || gateways.error || changeGateway.error || disconnect.error;
  const errorText = error instanceof Error ? error.message : "Something went wrong. Please try again.";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Integrations</p>
        <h1 className="mt-1 text-2xl font-semibold">Plugins</h1>
        <p className="mt-1 text-sm text-slate-500">Connect WooCommerce to bring your online products, orders, and payment methods into view.</p>
      </header>

      {connection.isLoading && <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Checking your connected store…</p>}
      {connection.error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{connection.error instanceof Error ? connection.error.message : "Could not load integrations."}</p>}

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-semibold">Add a WordPress plugin</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Upload the Pesapal ZIP you downloaded, then install and activate it in WordPress. You need a WordPress administrator account.</p></div>
          {pluginUploadUrl
            ? <a href={pluginUploadUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">＋ Add plugin</a>
            : <button type="button" disabled className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white opacity-50">＋ Add plugin</button>}
        </div>
        {!pluginUploadUrl && <p className="mt-3 text-xs text-slate-500">Enter your WordPress store URL in the WooCommerce connection form below to enable this button.</p>}
        {pluginUploadUrl && <p className="mt-3 text-xs text-slate-500">The button opens WordPress → Plugins → Add New → Upload Plugin. Choose the Pesapal ZIP, select Install, then Activate.</p>}
      </section>

      {!connected && !connection.isLoading && (
        <section className="rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div><h2 className="font-semibold">WooCommerce</h2><p className="mt-1 text-sm text-slate-500">Connect your WordPress shop to manage its installed payment methods and import products and paid orders.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Not connected</span>
          </div>
          <ol className="mb-5 list-inside list-decimal space-y-1 text-sm text-slate-600">
            <li>In WordPress, install and configure the payment plugin you want to use.</li>
            <li>In WooCommerce, go to Settings → Advanced → REST API and create a Read/Write key.</li>
            <li>Enter the store URL and key pair below. The keys are encrypted before they are saved.</li>
          </ol>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); connect.mutate(); }}>
            <label className="text-sm text-slate-600 sm:col-span-2">WordPress store URL<input required type="url" placeholder="https://your-store.com" value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label>
            <label className="text-sm text-slate-600">Consumer key<input required autoComplete="off" value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-slate-900" /></label>
            <label className="text-sm text-slate-600">Consumer secret<input required type="password" autoComplete="new-password" value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-slate-900" /></label>
            {connect.error && <p className="text-sm text-red-600 sm:col-span-2">{connect.error instanceof Error ? connect.error.message : "Could not connect to WooCommerce."}</p>}
            <button disabled={connect.isPending || !storeUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{connect.isPending ? "Checking connection…" : "Connect WooCommerce"}</button>
          </form>
        </section>
      )}

      {connected && (
        <>
          <section className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex items-center gap-2"><h2 className="font-semibold">WooCommerce</h2><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Connected</span></div><p className="mt-1 break-all text-sm text-slate-500">{connection.data.storeUrl}</p><p className="mt-2 text-xs text-slate-400">Last sync: {connection.data.lastSyncAt ? new Date(connection.data.lastSyncAt).toLocaleString() : "Not synced yet"}</p></div>
              <div className="flex gap-2"><button onClick={() => sync.mutate()} disabled={sync.isPending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{sync.isPending ? "Syncing store…" : "Sync products and orders"}</button><button onClick={() => setDisconnectOpen(true)} className="rounded-md border px-3 py-2 text-sm text-slate-600">Disconnect</button></div>
            </div>
            {sync.error && <p className="mt-3 text-sm text-red-600">{sync.error instanceof Error ? sync.error.message : "Sync failed."}</p>}
            {sync.data && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Sync complete: {sync.data.productsUpdated} products updated, {sync.data.ordersImported} paid orders imported{sync.data.ordersSkipped ? `, ${sync.data.ordersSkipped} orders skipped because their products are not linked or have insufficient stock` : ""}.</p>}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">WordPress payment methods</h2><p className="mt-1 text-sm text-slate-500">Install and configure payment plugins in WordPress first. Then enable the checkout methods you want below.</p></div><button type="button" onClick={() => gateways.refetch()} disabled={gateways.isFetching} className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">{gateways.isFetching ? "Refreshing…" : "Refresh methods"}</button></div>
            {gateways.isLoading && <p className="text-sm text-slate-500">Loading installed payment methods…</p>}
            {gateways.error && <p className="text-sm text-red-600">{gateways.error instanceof Error ? gateways.error.message : "Could not load payment methods."}</p>}
            {gateways.data?.length === 0 && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No payment methods were returned by WooCommerce. Install a WooCommerce payment gateway plugin in WordPress, then refresh this section.</p>}
            <div className="divide-y">
              {gateways.data?.map((gateway) => <label key={gateway.id} className="flex cursor-pointer items-center justify-between gap-4 py-3"><span className="min-w-0"><span className="block text-sm font-medium">{gateway.title}</span><span className="block truncate text-xs text-slate-500">{gateway.description || gateway.methodTitle || gateway.id}</span></span><input type="checkbox" checked={gateway.enabled} disabled={changeGateway.isPending} onChange={(event) => changeGateway.mutate({ id: gateway.id, enabled: event.target.checked })} aria-label={`${gateway.enabled ? "Disable" : "Enable"} ${gateway.title}`} className="h-4 w-4 accent-indigo-700" /></label>)}
            </div>
            {changeGateway.error && <p className="mt-2 text-sm text-red-600">{changeGateway.error instanceof Error ? changeGateway.error.message : "Could not update payment method."}</p>}
          </section>

          <p className="text-xs leading-5 text-slate-500">WooCommerce is the source for imported products and online orders. Imported paid orders reduce stock at your main POS branch. POS sales are not sent back to WooCommerce.</p>
        </>
      )}

      {disconnectOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="disconnect-title" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl"><h2 id="disconnect-title" className="font-semibold">Disconnect WooCommerce?</h2><p className="text-sm text-slate-600">This removes the saved API connection. Imported products and sales stay in the POS. For best security, also revoke this API key in WooCommerce.</p>{disconnect.error && <p className="text-sm text-red-600">{errorText}</p>}<div className="flex gap-2"><button onClick={() => setDisconnectOpen(false)} className="flex-1 rounded-md border py-2 text-sm">Cancel</button><button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="flex-1 rounded-md bg-red-600 py-2 text-sm text-white disabled:opacity-50">{disconnect.isPending ? "Disconnecting…" : "Disconnect"}</button></div></div></div>}
    </div>
  );
}
