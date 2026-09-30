import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> };

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export function InstallAppButton({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(standalone);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const syncPrompt = () => setInstallPrompt(((window as any).__ashlerInstallPrompt as InstallPrompt | null) ?? null);
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    syncPrompt();
    window.addEventListener("ashler-install-prompt-available", syncPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("ashler-install-prompt-available", syncPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) { setHelpOpen(true); return; }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    (window as any).__ashlerInstallPrompt = null;
    setInstallPrompt(null);
  }

  return <>
    <button type="button" onClick={install} disabled={installed} className={`rounded-md border px-3 py-2 text-xs font-medium disabled:cursor-default disabled:opacity-70 ${variant === "dark" ? "border-white/30 bg-white/10 text-white hover:bg-white/20" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
      {installed ? "App installed" : "Install app"}
    </button>
    {helpOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="install-app-title" className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl text-slate-900">
      <h2 id="install-app-title" className="font-semibold">Install Ashler Trends on Chrome</h2>
      <p className="text-sm text-slate-600">In Chrome, open this POS over its HTTPS link, then select <strong>⋮ → Cast, save, and share → Install page as app</strong>. If Chrome shows an install icon in the address bar, select that instead.</p>
      <p className="text-xs text-slate-500">Chrome may hide this option if the site is already installed or is still loading its latest update. Refresh the POS and check the menu again.</p>
      <button type="button" onClick={() => setHelpOpen(false)} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Got it</button>
    </section></div>}
  </>;
}
