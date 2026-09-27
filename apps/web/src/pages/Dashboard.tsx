import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { productImageSrc } from "../lib/imageUrl";

const money = (value: number) => `KSh ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function Dashboard() {
  const { user, activeBranchId } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", activeBranchId],
    queryFn: async () => (await api.get("/reports/dashboard", { params: { branchId: activeBranchId } })).data,
  });
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (6 - index));
    return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) };
  }), []);
  const weekData = days.map((day) => ({ ...day, ...(data?.weeklySales?.find((row: any) => row.date === day.key) ?? { revenue: 0, transactions: 0 }) }));
  const peak = Math.max(1, ...weekData.map((day) => Number(day.revenue)));
  const weekTotal = weekData.reduce((sum, day) => sum + Number(day.revenue), 0);
  const average = data?.todaySalesCount ? Number(data.todaySalesTotal) / data.todaySalesCount : 0;
  const hour = now.getHours();
  const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

  return <div className="space-y-6 pb-6">
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-5 text-white shadow-sm md:p-7">
      <div><p className="text-sm text-slate-300">Your store overview</p><h1 className="mt-1 text-2xl font-semibold">{greeting}, {user?.name?.split(" ")[0]}</h1><p className="mt-2 text-sm text-slate-300">{now.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p className="mt-1 text-sm text-slate-300">Here’s what’s happening in your boutique today.</p></div>
      <Link to="/sell" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm">＋ New sale</Link>
    </section>

    {isError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Dashboard details couldn’t load. Refresh to try again.</div>}
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Sales today" value={money(data?.todaySalesTotal)} detail={`${data?.todaySalesCount ?? 0} completed transactions`} accent="indigo" />
      <Metric label="Average sale" value={money(average)} detail="Per transaction today" accent="green" />
      <Metric label="Active products" value={data?.productCount ?? 0} detail="Products in your catalogue" accent="blue" />
      <Metric label="Low stock" value={data?.lowStockCount ?? 0} detail="5 units or fewer" accent={data?.lowStockCount ? "amber" : "green"} />
    </section>

    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Sales this week</h2><p className="mt-1 text-xs text-slate-500">Revenue over the last seven days</p></div><div className="text-right"><div className="text-lg font-semibold">{money(weekTotal)}</div><div className="text-xs text-slate-500">weekly revenue</div></div></div>
        <div className="mt-6 grid h-40 grid-cols-7 items-end gap-2 sm:gap-4" aria-label="Sales revenue by day">
          {weekData.map((day) => <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
            <div className="flex w-full flex-1 items-end justify-center"><div title={`${day.label}: ${money(Number(day.revenue))}`} className={`w-full max-w-10 rounded-t-md transition-all ${Number(day.revenue) > 0 ? "bg-indigo-500" : "bg-slate-100"}`} style={{ height: `${Math.max(Number(day.revenue) > 0 ? 8 : 3, Number(day.revenue) / peak * 100)}%` }} /></div>
            <span className="text-[11px] text-slate-500">{day.label}</span>
          </div>)}
        </div>
        {weekTotal === 0 && <p className="mt-2 text-center text-xs text-slate-400">Completed sales will appear here.</p>}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Best sellers</h2><p className="mt-1 text-xs text-slate-500">By revenue this week</p></div><Link to="/reports" className="text-xs font-medium text-indigo-700">Full reports →</Link></div>
        <div className="mt-4 space-y-3">
          {data?.topProducts?.map((product: any, index: number) => <div key={product.id} className="flex items-center gap-3">
            <span className="w-5 text-xs font-semibold text-slate-400">0{index + 1}</span><ProductThumb imageUrl={product.imageUrl} name={product.name} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{product.name}</div><div className="text-xs text-slate-500">{product.units} sold</div></div><div className="text-right text-sm font-medium">{money(product.revenue)}</div>
          </div>)}
          {!isLoading && !data?.topProducts?.length && <p className="rounded-lg bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">No sales recorded this week yet.</p>}
        </div>
      </section>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Recent transactions</h2><p className="mt-1 text-xs text-slate-500">Latest completed sales</p></div><Link to="/reports" className="text-xs font-medium text-indigo-700">View reports →</Link></div>
        <div className="mt-3 divide-y">
          {data?.recentSales?.map((sale: any) => <div key={sale.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><div className="text-sm font-medium">{sale.employee}</div><div className="text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {sale.paymentMethod}</div></div>
            <div className="shrink-0 text-sm font-semibold">{money(sale.total)}</div>
          </div>)}
          {!isLoading && !data?.recentSales?.length && <p className="py-6 text-center text-sm text-slate-500">No completed sales yet. Start with a new sale.</p>}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Stock watch</h2><p className="mt-1 text-xs text-slate-500">Items at or below five units</p></div><Link to="/inventory" className="text-xs font-medium text-indigo-700">Manage stock →</Link></div>
        <div className="mt-3 space-y-2">
          {data?.lowStockProducts?.map((item: any, index: number) => <div key={`${item.name}-${item.color}-${item.size}-${index}`} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5"><ProductThumb imageUrl={item.imageUrl} name={item.name} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.name}</div><div className="text-xs text-slate-500">{[item.color, item.size].filter(Boolean).join(" · ") || "Standard"}</div></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{item.quantity} left</span></div>)}
          {!isLoading && !data?.lowStockProducts?.length && <div className="rounded-lg bg-green-50 px-3 py-5 text-center text-sm text-green-800">All tracked products are stocked above the low-stock threshold.</div>}
        </div>
      </section>
    </div>
  </div>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string | number; detail: string; accent: "indigo" | "green" | "blue" | "amber" }) {
  const colors = { indigo: "bg-indigo-50 text-indigo-700", green: "bg-green-50 text-green-700", blue: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700" };
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`h-2 w-2 rounded-full ${colors[accent].split(" ")[0]}`} /></div><div className="mt-2 text-xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-[11px] text-slate-500">{detail}</div></div>;
}

function ProductThumb({ imageUrl, name }: { imageUrl?: string | null; name: string }) {
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-lg text-slate-400">{imageUrl ? <img src={productImageSrc(imageUrl)} alt={name} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : "👗"}</div>;
}
