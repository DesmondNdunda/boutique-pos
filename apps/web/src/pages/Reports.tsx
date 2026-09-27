import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

export function Reports() {
  const { activeBranchId } = useAuth();
  const [to, setTo] = useState(isoDate(new Date()));
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 29 * 86400000)));
  const params = useMemo(() => ({ from, to, branchId: activeBranchId ?? undefined }), [from, to, activeBranchId]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["report-summary", params],
    queryFn: async () => (await api.get("/reports/summary", { params })).data,
  });
  const { data: topData } = useQuery({
    queryKey: ["report-products", params],
    queryFn: async () => (await api.get("/reports/top-products", { params })).data,
  });

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Sales summary", "Value"], ["From", from], ["To", to], ["Transactions", data.count],
      ["Revenue (KSh)", Number(data.total).toFixed(2)], ["Average sale (KSh)", Number(data.average).toFixed(2)],
      [], ["Daily sales"], ["Date", "Revenue (KSh)"], ...(data.byDay ?? []).map((r: any) => [r.date, Number(r.total).toFixed(2)]),
      [], ["Payment methods"], ["Method", "Revenue (KSh)"], ...(data.byMethod ?? []).map((r: any) => [r.method, Number(r.total).toFixed(2)]),
      [], ["Top products"], ["Product", "Units sold", "Revenue (KSh)"], ...(topData?.products ?? []).map((r: any) => [r.name, r.units, Number(r.revenue).toFixed(2)]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `boutique-sales-${from}-to-${to}.csv`; link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Sales reports</h1><p className="text-sm text-slate-500">Revenue and product performance for your selected dates.</p></div>
      <button onClick={exportCsv} disabled={!data} className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">Export CSV</button>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <label className="text-xs text-slate-500">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-md border px-3 py-2 text-sm text-slate-800" /></label>
      <label className="text-xs text-slate-500">To<input type="date" value={to} min={from} max={isoDate(new Date())} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-md border px-3 py-2 text-sm text-slate-800" /></label>
    </div>
    {isLoading && <p className="text-sm text-slate-500">Loading report…</p>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load report. Try again.</p>}
    {data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Revenue" value={`KSh ${Number(data.total).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Metric label="Transactions" value={data.count} />
        <Metric label="Average sale" value={`KSh ${Number(data.average).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
      </div>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Daily sales</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Date</th><th className="py-2 text-right">Revenue</th></tr></thead><tbody>
          {(data.byDay ?? []).map((r: any) => <tr key={r.date} className="border-t"><td className="py-2">{r.date}</td><td className="py-2 text-right">KSh {Number(r.total).toLocaleString()}</td></tr>)}
          {data.byDay?.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-slate-400">No sales in this period</td></tr>}
        </tbody></table></div>
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Top products</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Product</th><th className="py-2 text-right">Units</th><th className="py-2 text-right">Revenue</th></tr></thead><tbody>
          {(topData?.products ?? []).map((r: any) => <tr key={r.productId} className="border-t"><td className="py-2">{r.name}</td><td className="py-2 text-right">{r.units}</td><td className="py-2 text-right">KSh {Number(r.revenue).toLocaleString()}</td></tr>)}
          {topData?.products?.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">No products sold in this period</td></tr>}
        </tbody></table></div>
      </section>
      <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 font-medium">Payment methods</h2><div className="flex flex-wrap gap-3">{(data.byMethod ?? []).map((r: any) => <div key={r.method} className="rounded-lg bg-slate-50 px-4 py-3"><div className="text-xs text-slate-500">{r.method}</div><div className="font-semibold">KSh {Number(r.total).toLocaleString()}</div></div>)}{data.byMethod?.length === 0 && <p className="text-sm text-slate-400">No successful payments for this period.</p>}</div></section>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}
