import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { productImageSrc } from "../lib/imageUrl";
import { useAuth } from "../store/auth";
import type { Product } from "@boutique-pos/shared";

async function optimizeProductImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not optimize image")), "image/webp", 0.82);
    });
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

export function Products() {
  const { user, activeBranchId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const canEdit = user?.role === "OWNER" || user?.role === "MANAGER";

  const { data } = useQuery({
    queryKey: ["products", activeBranchId],
    queryFn: async () => (await api.get("/products", { params: { branchId: activeBranchId } })).data.products as Product[],
    refetchInterval: user?.role === "EMPLOYEE" ? 15_000 : false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Products</h1>
        {canEdit && (
          <button onClick={() => setShowForm(true)} className="bg-brand text-white text-sm rounded-md px-3 py-2">
            + Add Product
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {data?.map((p) => {
          const totalStock = p.variants.reduce((sum, v) => sum + v.inventory.reduce((s, i) => s + i.quantity, 0), 0);
          return (
            <div key={p.id} className="bg-white border rounded-xl p-3">
              <div className="aspect-square bg-slate-100 rounded-lg mb-2 flex items-center justify-center text-2xl">
                {p.imageUrl ? <img src={productImageSrc(p.imageUrl)} alt={p.name} loading="lazy" decoding="async" className="rounded-lg object-cover w-full h-full" /> : "👕"}
              </div>
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-slate-500">KSh {Number(p.basePrice).toLocaleString()}</div>
              <div className={`text-xs mt-1 ${totalStock <= 5 ? "text-amber-600" : "text-slate-400"}`}>
                {totalStock} in stock
              </div>
            </div>
          );
        })}
        {data?.length === 0 && <p className="text-sm text-slate-400 col-span-full">No products yet.</p>}
      </div>

      {showForm && <AddProductModal branchId={activeBranchId!} onClose={() => setShowForm(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["products"] })} />}
    </div>
  );
}

interface VariantRow { size: string; color: string; initialStock: number }

function AddProductModal({ branchId, onClose, onSaved }: { branchId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [hasVariants, setHasVariants] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([{ size: "", color: "", initialStock: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined = photoUrl.trim() || undefined;
      if (imageFile) {
        setSaveProgress("Optimizing photo…");
        const optimized = await optimizeProductImage(imageFile);
        setSaveProgress("Uploading photo…");
        imageUrl = (await api.post("/products/images", { data: await blobToBase64(optimized), contentType: optimized.type || imageFile.type })).data.imageUrl;
      }
      setSaveProgress("Saving product…");
      const payload = {
        name,
        basePrice: Number(basePrice),
        hasVariants,
        branchId,
        imageUrl,
        variants: hasVariants
          ? variants.map((v) => ({ size: v.size || undefined, color: v.color || undefined, initialStock: Number(v.initialStock) || 0 }))
          : [{ initialStock: Number(variants[0]?.initialStock) || 0 }],
      };
      return (await api.post("/products", payload)).data;
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => { setError(e.message); setSaveProgress(""); },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <h2 className="font-semibold">Add Product</h2>

        <div>
          <label className="text-sm text-slate-600">Product name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 border rounded-md px-3 py-2 text-sm" placeholder="Classic T-Shirt" />
        </div>
        <div>
          <label className="text-sm text-slate-600">Selling price (KSh)</label>
          <input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className="w-full mt-1 border rounded-md px-3 py-2 text-sm" placeholder="1500" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-slate-600">Product photo</label>
          <input type="url" value={photoUrl} onChange={(e) => { setPhotoUrl(e.target.value); if (e.target.value) setImageFile(null); }} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Paste an image URL" />
          <div className="text-center text-xs text-slate-400">or upload a photo</div>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setImageFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setPhotoUrl(""); }} className="w-full text-sm" />
          <p className="text-xs text-slate-400">JPEG, PNG, or WebP up to 5 MB. Uploaded photos are saved locally in development and use Supabase Storage in production.</p>
          {(photoUrl || imageFile) && <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">{photoUrl && <img src={photoUrl} alt="Product preview" className="h-12 w-12 rounded-md object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}<span className="truncate text-xs text-slate-500">{imageFile?.name ?? "Image preview"}</span><button type="button" onClick={() => { setPhotoUrl(""); setImageFile(null); }} className="ml-auto text-xs text-red-600">Remove</button></div>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
          This product has sizes/colors
        </label>

        {hasVariants ? (
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input placeholder="Size" value={v.size} onChange={(e) => { const c = [...variants]; c[i].size = e.target.value; setVariants(c); }} className="border rounded-md px-2 py-1.5 text-sm w-16" />
                <input placeholder="Color" value={v.color} onChange={(e) => { const c = [...variants]; c[i].color = e.target.value; setVariants(c); }} className="border rounded-md px-2 py-1.5 text-sm flex-1" />
                <input type="number" placeholder="Qty" value={v.initialStock} onChange={(e) => { const c = [...variants]; c[i].initialStock = Number(e.target.value); setVariants(c); }} className="border rounded-md px-2 py-1.5 text-sm w-16" />
                <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setVariants([...variants, { size: "", color: "", initialStock: 0 }])} className="text-brand text-sm">+ Add variant row</button>
          </div>
        ) : (
          <div>
            <label className="text-sm text-slate-600">Initial stock quantity</label>
            <input type="number" value={variants[0]?.initialStock ?? 0} onChange={(e) => setVariants([{ size: "", color: "", initialStock: Number(e.target.value) }])} className="w-full mt-1 border rounded-md px-3 py-2 text-sm" />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 border rounded-md py-2 text-sm">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !basePrice} className="flex-1 bg-brand text-white rounded-md py-2 text-sm disabled:opacity-50">
            {mutation.isPending ? (saveProgress || "Saving…") : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
