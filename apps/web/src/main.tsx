import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

// Capture Chrome's one-shot install event at app startup, before the user
// finishes signing in and the authenticated layout mounts.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  (window as any).__ashlerInstallPrompt = event;
  window.dispatchEvent(new Event("ashler-install-prompt-available"));
});
window.addEventListener("appinstalled", () => { (window as any).__ashlerInstallPrompt = null; });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000, gcTime: 5 * 60_000 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
