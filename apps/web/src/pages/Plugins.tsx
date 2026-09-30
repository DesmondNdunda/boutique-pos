import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

type Gateway = { id: string; title: string; description: string; enabled: boolean; methodTitle: string };
type RecommendedPlugin = { slug: string; name: string; purpose: string; installed: boolean; active: boolean; version: string | null };

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
  const [wpUsername, setWpUsername] = useState("");
  const [wpApplicationPassword, setWpApplicationPassword] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [wpAccessEditing, setWpAccessEditing] = useState(false);
  const [pluginToInstall, setPluginToInstall] = useState<RecommendedPlugin | null>(null);

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
  const wpPlugins = useQuery({
    queryKey: ["wordpress-recommended-plugins"],
    queryFn: async () => (await api.get("/integrations/woocommerce/wordpress-plugins")).data.plugins as RecommendedPlugin[],
    enabled: connected && connection.data?.wpPluginAccessConfigured === true && user?.role === "OWNER",
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
      await queryClient.invalidateQueries({ queryKey: ["wordpress-recommended-plugins"] });
    },
  });

  const saveWpAccess = useMutation({
    mutationFn: async () => api.put("/integrations/woocommerce/wordpress-access", { username: wpUsername.trim(), applicationPassword: wpApplicationPassword.trim() }),
    onSuccess: async () => {
      setWpAccessEditing(false);
      setWpApplicationPassword("");
      await queryClient.invalidateQueries({ queryKey: ["woocommerce-connection"] });
      await queryClient.invalidateQueries({ queryKey: ["wordpress-recommended-plugins"] });
    },
  });
  const installPlugin = useMutation({
    mutationFn: async (plugin: RecommendedPlugin) => api.post(`/integrations/woocommerce/wordpress-plugins/${encodeURIComponent(plugin.slug)}/install`),
    onSuccess: async () => {
      setPluginToInstall(null);
      await queryClient.invalidateQueries({ queryKey: ["wordpress-recommended-plugins"] });
    },
  });

  const error = connect.error || sync.error || gateways.error || changeGateway.error || disconnect.error || saveWpAccess.error || installPlugin.error;
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">Recommended WordPress plugins</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Install selected plugins directly from the WordPress plugin directory. Each install also activates the plugin on your live store.</p></div>
              {connection.data.wpPluginAccessConfigured && <button type="button" onClick={() => wpPlugins.refetch()} disabled={wpPlugins.isFetching} className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">{wpPlugins.isFetching ? "Refreshing…" : "Refresh plugins"}</button>}
            </div>
            {!connection.data.wpPluginAccessConfigured || wpAccessEditing ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-slate-700">To install plugins, connect a WordPress Administrator using an Application Password. In WordPress, open <strong>Users → Profile → Application Passwords</strong>, create one named “Ashler POS,” then enter it here. It is encrypted before saving and is never shown again.</p>
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveWpAccess.mutate(); }}>
                  <label className="text-sm text-slate-600">WordPress username<input required autoComplete="username" value={wpUsername} onChange={(event) => setWpUsername(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label>
                  <label className="text-sm text-slate-600">Application Password<input required type="password" autoComplete="new-password" value={wpApplicationPassword} onChange={(event) => setWpApplicationPassword(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-slate-900" /></label>
                  {saveWpAccess.error && <p className="text-sm text-red-600 sm:col-span-2">{saveWpAccess.error instanceof Error ? saveWpAccess.error.message : "Could not verify WordPress access."}</p>}
                  {saveWpAccess.isSuccess && <p role="status" className="text-sm text-emerald-700 sm:col-span-2">WordPress access verified and saved.</p>}
                  <div className="flex gap-2 sm:col-span-2"><button disabled={saveWpAccess.isPending || !wpUsername.trim() || !wpApplicationPassword.trim()} className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saveWpAccess.isPending ? "Verifying access…" : "Save WordPress access"}</button>{connection.data.wpPluginAccessConfigured && <button type="button" onClick={() => setWpAccessEditing(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button>}</div>
                </form>
                <p className="mt-3 text-xs text-slate-500">Application Passwords require HTTPS and a WordPress account allowed to install plugins. Use this only on your own store.</p>
              </div>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">WordPress admin access is connected. The saved password is encrypted and never shown.</p><button type="button" onClick={() => setWpAccessEditing((editing) => !editing)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-slate-700">{wpAccessEditing ? "Cancel update" : "Update admin access"}</button></div>
                {wpPlugins.isLoading && <p className="mt-4 text-sm text-slate-500">Checking installed plugins…</p>}
                {wpPlugins.error && <p className="mt-4 text-sm text-red-600">{wpPlugins.error instanceof Error ? wpPlugins.error.message : "Could not load WordPress plugins."}</p>}
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {wpPlugins.data?.map((plugin) => <article key={plugin.slug} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{plugin.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${plugin.active ? "bg-emerald-50 text-emerald-700" : plugin.installed ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{plugin.active ? "Active" : plugin.installed ? "Inactive" : "Not installed"}</span></div>
                    <p className="mt-2 min-h-12 text-sm text-slate-500">{plugin.purpose}</p>
                    {plugin.version && <p className="mt-2 text-xs text-slate-400">Version {plugin.version}</p>}
                    <button type="button" onClick={() => setPluginToInstall(plugin)} disabled={plugin.active || installPlugin.isPending} className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{plugin.active ? "Installed and active" : plugin.installed ? "Activate plugin" : "Install and activate"}</button>
                  </article>)}
                </div>
              </>
            )}
            {installPlugin.error && <p className="mt-3 text-sm text-red-600">{installPlugin.error instanceof Error ? installPlugin.error.message : "Could not install the plugin."}</p>}
            {installPlugin.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Plugin installed and activated successfully.</p>}
          </section>

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
      {pluginToInstall && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="plugin-install-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl"><h2 id="plugin-install-title" className="font-semibold">{pluginToInstall.installed ? "Activate" : "Install and activate"} {pluginToInstall.name}?</h2><p className="text-sm text-slate-600">This changes your live WordPress store. Make sure you have a recent backup before continuing. WordPress will download this plugin from its official plugin directory.</p><div className="flex gap-2"><button onClick={() => setPluginToInstall(null)} className="flex-1 rounded-md border py-2 text-sm">Cancel</button><button onClick={() => installPlugin.mutate(pluginToInstall)} disabled={installPlugin.isPending} className="flex-1 rounded-md bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{installPlugin.isPending ? "Working…" : "Confirm"}</button></div></div></div>}
    </div>
  );
}
