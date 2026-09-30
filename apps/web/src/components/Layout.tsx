import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { InstallAppButton } from "./InstallAppButton";

const ownerLinks = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/sell", label: "Sell", icon: "🛒" },
  { to: "/products", label: "Products", icon: "👕" },
  { to: "/inventory", label: "Inventory", icon: "📦" },
  { to: "/team", label: "Team", icon: "👥" },
  { to: "/reports", label: "Reports", icon: "📈" },
  { to: "/billing", label: "Billing", icon: "💳" },
  { to: "/plugins", label: "Plugins", icon: "🔌" },
];

const employeeLinks = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/sell", label: "Sell", icon: "🛒" },
  { to: "/products", label: "Products", icon: "👕" },
];

export function Layout() {
  const { user, logout, activeBranchId, setActiveBranch } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchError, setBranchError] = useState("");
  const [savingBranch, setSavingBranch] = useState(false);
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get("/branches")).data.branches,
    enabled: user?.role === "OWNER" || user?.role === "MANAGER",
  });
  const links = user?.role === "EMPLOYEE" ? employeeLinks : ownerLinks.filter((link) => link.to !== "/plugins" || user?.role === "OWNER");

  async function createBranch(e: React.FormEvent) {
    e.preventDefault(); setBranchError(""); setSavingBranch(true);
    try {
      const { data } = await api.post("/branches", { name: branchName.trim(), address: branchAddress.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      setActiveBranch(data.branch.id); setBranchName(""); setBranchAddress(""); setShowBranchForm(false);
    } catch (err: any) { setBranchError(err.message); }
    finally { setSavingBranch(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col bg-brand text-white p-4">
        <div className="text-lg font-semibold mb-6">Ashler Trends</div>
        <nav className="flex-1 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  isActive ? "bg-brand-light" : "hover:bg-brand-light/60"
                }`
              }
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="text-xs text-slate-300 mb-2">
          {user?.name} · {user?.role}
        </div>
        <div className="mb-2"><InstallAppButton /></div>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="text-sm text-left px-3 py-2 rounded-md hover:bg-brand-light/60"
        >
          Log out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between gap-2 bg-brand text-white px-4 py-3 sticky top-0 z-10"
        style={{ paddingTop: "env(safe-area-inset-top, 0.75rem)" }}>
        <div className="font-semibold">Ashler Trends</div>
        <div className="flex items-center gap-2"><InstallAppButton /><button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="text-xs opacity-80"
        >
          Log out
        </button></div>
      </header>

      <main className="flex-1 p-4 pb-20 md:pb-4 max-w-5xl w-full mx-auto">
        {(user?.role === "OWNER" || user?.role === "MANAGER") && branches?.length > 0 && <div className="mb-4 flex items-center justify-end gap-2 text-sm"><label htmlFor="active-branch" className="text-slate-500">Branch</label><select id="active-branch" value={activeBranchId ?? ""} onChange={(e) => setActiveBranch(e.target.value)} className="rounded-md border bg-white px-3 py-2">{branches.map((branch: any) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{user.role === "OWNER" && <button onClick={() => setShowBranchForm(true)} className="rounded-md border bg-white px-3 py-2">+ Branch</button>}</div>}
        {showBranchForm && <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center"><form onSubmit={createBranch} className="w-full space-y-4 rounded-t-2xl bg-white p-5 md:max-w-md md:rounded-2xl"><h2 className="font-semibold">Add a branch</h2><label className="block text-sm text-slate-600">Branch name<input autoFocus required maxLength={120} value={branchName} onChange={(e) => setBranchName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="block text-sm text-slate-600">Address (optional)<input maxLength={250} value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" /></label>{branchError && <p className="text-sm text-red-600">{branchError}</p>}<div className="flex gap-2"><button type="button" onClick={() => setShowBranchForm(false)} className="flex-1 rounded-md border py-2">Cancel</button><button disabled={savingBranch || !branchName.trim()} className="flex-1 rounded-md bg-brand py-2 text-white disabled:opacity-50">{savingBranch ? "Saving…" : "Create branch"}</button></div></form></div>}
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around overflow-x-auto py-1"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0.25rem)" }}
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `flex shrink-0 flex-col items-center py-1 px-2 text-xs ${isActive ? "text-brand font-medium" : "text-slate-500"}`
            }
          >
            <span className="text-lg">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
