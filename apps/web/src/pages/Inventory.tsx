import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type { Product } from "@boutique-pos/shared";
import { productImageSrc } from "../lib/imageUrl";

export function Inventory() {
  const { activeBranchId } = useAuth();
  const qc = useQueryClient();
  const [restockTarget, setRestockTarget] = useState<{ variantId: string; productId: string; label: string; imageUrl?: string | null } | null>(null);
  const [qty, setQty] = useState("");
  const [restockImage, setRestockImage] = useState<{ data: string; contentType: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ variantId: string; label: string } | null>(null);
  const [transferQty, setTransferQty] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches")).data.branches });

  const { data: products } = useQuery({
    queryKey: ["products", activeBranchId],
    queryFn: async () => (await api.get("/products", { params: { branchId: activeBranchId } })).data.products as Product[],
  });

  const { data: movements } = useQuery({
    queryKey: ["movements", activeBranchId],
    queryFn: async () => (await api.get("/inventory/movements", { params: { branchId: activeBranchId } })).data.movements,
  });

  const restock = useMutation({
    mutationFn: async () => {
      if (restockImage) {
        const { imageUrl } = (await api.post("/products/images", { data: restockImage.data.split(",")[1] ?? "", contentType: restockImage.contentType })).data;
        await api.patch(`/products/${restockTarget!.productId}`, { imageUrl });
      }
      return (await api.post("/inventory/restock", { variantId: restockTarget!.variantId, branchId: activeBranchId, quantity: Number(qty) })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setRestockTarget(null);
      setQty("");
      setRestockImage(null);
      setError(null);
    },
    onError: (e: any) => { setError(e.message); qc.invalidateQueries({ queryKey: ["products"] }); },
  });

  const transfer = useMutation({
    mutationFn: async () => (await api.post("/inventory/transfer", { variantId: transferTarget!.variantId, fromBranchId: activeBranchId, toBranchId: destination, quantity: Number(transferQty), note: note || undefined })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["movements"] });
      setTransferTarget(null); setTransferQty(""); setDestination(""); setNote(""); setError(null);
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Inventory</h1>

      <div className="space-y-2">
        {products?.map((p) =>
          p.variants.map((v) => {
            const stock = v.inventory.reduce((s, i) => s + i.quantity, 0);
            const label = [p.name, v.color, v.size].filter(Boolean).join(" / ");
            return (
              <div key={v.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className={`text-xs ${stock <= 5 ? "text-amber-600" : "text-slate-400"}`}>{stock} in stock</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setRestockTarget({ variantId: v.id, productId: p.id, label, imageUrl: p.imageUrl }); setRestockImage(null); setQty(""); setError(null); }} className="text-xs bg-brand text-white rounded-md px-3 py-1.5">Restock</button>
                  {(branches?.length ?? 0) > 1 && <button onClick={() => { setTransferTarget({ variantId: v.id, label }); setError(null); }} className="text-xs border rounded-md px-3 py-1.5">Transfer</button>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Recent stock movements</h2>
        <div className="space-y-1">
          {movements?.slice(0, 15).map((m: any) => (
            <div key={m.id} className="text-xs flex justify-between text-slate-500 border-b py-1">
              <span>{m.variant.product.name} {m.reason}</span>
              <span className={m.quantityChange > 0 ? "text-green-600" : "text-red-500"}>
                {m.quantityChange > 0 ? "+" : ""}{m.quantityChange} → {m.quantityAfter}
              </span>
            </div>
          ))}
        </div>
      </div>

      {restockTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-4">
            <h2 className="font-semibold">Restock</h2>
            <p className="text-sm text-slate-600">{restockTarget.label}</p>
            <div className="space-y-2">
              <label className="block text-sm text-slate-600">Product image (optional)</label>
              {(restockImage || restockTarget.imageUrl) && <img src={restockImage?.data ?? productImageSrc(restockTarget.imageUrl)} alt={`${restockTarget.label} preview`} className="h-24 w-24 rounded-lg border object-cover" />}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) { setRestockImage(null); return; }
                if (file.size > 5 * 1024 * 1024) { setError("Image must be smaller than 5 MB"); e.currentTarget.value = ""; return; }
                const reader = new FileReader();
                reader.onload = () => setRestockImage({ data: String(reader.result), contentType: file.type, name: file.name });
                reader.onerror = () => setError("Could not read image");
                reader.readAsDataURL(file);
              }} className="w-full text-sm" />
              {restockImage && <p className="text-xs text-slate-500">Selected: {restockImage.name}</p>}
              <p className="text-xs text-slate-400">JPEG, PNG, or WebP up to 5 MB. Choosing a photo replaces the current product image.</p>
            </div>
            <input
              type="number" autoFocus placeholder="Quantity" value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setRestockTarget(null); setRestockImage(null); setError(null); }} className="flex-1 border rounded-md py-2 text-sm">Cancel</button>
              <button onClick={() => restock.mutate()} disabled={Number(qty) < 1 || restock.isPending} className="flex-1 bg-brand text-white rounded-md py-2 text-sm disabled:opacity-50">
                {restock.isPending ? "Saving..." : "Restock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferTarget && <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20"><div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-4">
        <h2 className="font-semibold">Transfer stock</h2><p className="text-sm text-slate-600">{transferTarget.label} from your active branch</p>
        <label className="block text-sm text-slate-600">Destination branch<select value={destination} onChange={(e) => setDestination(e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2"><option value="">Choose branch</option>{branches?.filter((b: any) => b.id !== activeBranchId).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <input type="number" min="1" placeholder="Quantity" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2"><button onClick={() => { setTransferTarget(null); setError(null); }} className="flex-1 border rounded-md py-2 text-sm">Cancel</button><button onClick={() => transfer.mutate()} disabled={!destination || Number(transferQty) < 1 || transfer.isPending} className="flex-1 bg-brand text-white rounded-md py-2 text-sm disabled:opacity-50">{transfer.isPending ? "Transferring…" : "Transfer"}</button></div>
      </div></div>}
    </div>
  );
}
