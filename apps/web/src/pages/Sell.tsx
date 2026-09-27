import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { productImageSrc } from "../lib/imageUrl";
import { useAuth } from "../store/auth";
import type { Product, CartItem, PaymentMethod } from "@boutique-pos/shared";

export function Sell() {
  const { activeBranchId } = useAuth();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products", activeBranchId, search],
    queryFn: async () => (await api.get("/products", { params: { branchId: activeBranchId, search: search || undefined } })).data.products as Product[],
  });

  function addToCart(product: Product, variantId: string) {
    const variant = product.variants.find((v) => v.id === variantId)!;
    const stock = variant.inventory.reduce((s, i) => s + i.quantity, 0);
    if (stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === variantId);
      if (existing) {
        if (existing.quantity >= stock) return prev;
        return prev.map((i) => (i.variantId === variantId ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          variantId,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          unitPrice: Number(variant.price ?? product.basePrice),
          quantity: 1,
          maxQuantity: stock,
        },
      ];
    });
  }

  function changeQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(i.maxQuantity, Math.max(0, i.quantity + delta)) } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  if (paying) {
    return <Checkout cart={cart} branchId={activeBranchId!} total={total} onDone={() => { setCart([]); setPaying(false); }} onBack={() => setPaying(false)} />;
  }

  return (
    <div className="space-y-4 pb-40">
      <input
        placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
      />

      <div className="space-y-3">
        {products?.map((p) => (
          <div key={p.id} className="bg-white border rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">{p.imageUrl && <img src={productImageSrc(p.imageUrl)} alt={p.name} className="h-full w-full object-cover" />}</div><div className="truncate font-medium text-sm">{p.name}</div></div>
              <div className="text-sm text-slate-500">KSh {Number(p.basePrice).toLocaleString()}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((v) => {
                const stock = v.inventory.reduce((s, i) => s + i.quantity, 0);
                const label = [v.color, v.size].filter(Boolean).join(" / ") || "Add";
                return (
                  <button
                    key={v.id}
                    disabled={stock <= 0}
                    onClick={() => addToCart(p, v.id)}
                    className="text-xs border rounded-md px-2 py-1.5 disabled:opacity-30 disabled:line-through"
                  >
                    {label} <span className="text-slate-400">({stock})</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-14 md:bottom-4 left-0 right-0 px-4 z-10">
          <div className="max-w-5xl mx-auto bg-brand text-white rounded-xl p-4 shadow-lg">
            <div className="flex justify-between text-sm mb-2">
              <span>{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
              <span className="font-semibold">KSh {total.toLocaleString()}</span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1 mb-2">
              {cart.map((i) => (
                <div key={i.variantId} className="flex items-center justify-between text-xs">
                  <span>{i.productName} {[i.color, i.size].filter(Boolean).join("/")}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i.variantId, -1)} className="w-5 h-5 bg-white/20 rounded">-</button>
                    {i.quantity}
                    <button onClick={() => changeQty(i.variantId, 1)} className="w-5 h-5 bg-white/20 rounded">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPaying(true)} className="w-full bg-white text-brand rounded-md py-2 text-sm font-semibold">
              Charge KSh {total.toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Checkout({ cart, branchId, total, onDone, onBack }: { cart: CartItem[]; branchId: string; total: number; onDone: () => void; onBack: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [phone, setPhone] = useState("");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/sales/checkout", {
        branchId,
        items: cart.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        paymentMethod: method,
        phoneNumber: method === "MPESA" ? phone : undefined,
      });
      return data.sale;
    },
    onSuccess: (sale) => {
      setError(null);
      if (method === "MPESA") {
        setSaleId(sale.id);
        setPollingStatus("PENDING_PAYMENT");
        poll(sale.id);
      } else {
        onDone();
      }
    },
    onError: (e: any) => setError(e.message),
  });

  async function poll(id: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const { data } = await api.get(`/sales/${id}/status`);
        if (data.status === "COMPLETED") { setPollingStatus("COMPLETED"); return; }
        if (data.status === "CANCELED") { setPollingStatus("CANCELED"); return; }
      } catch { /* keep polling */ }
    }
    setPollingStatus("TIMEOUT");
  }

  if (saleId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 space-y-3">
        {pollingStatus === "PENDING_PAYMENT" && (
          <>
            <div className="text-4xl animate-pulse">📱</div>
            <p className="font-medium">Ask the customer to enter their M-Pesa PIN</p>
            <p className="text-sm text-slate-500">Waiting for confirmation on {phone}...</p>
          </>
        )}
        {pollingStatus === "COMPLETED" && (
          <>
            <div className="text-4xl">✅</div>
            <p className="font-medium">Payment received</p>
            <button onClick={onDone} className="mt-3 bg-brand text-white rounded-md px-4 py-2 text-sm">New sale</button>
          </>
        )}
        {(pollingStatus === "CANCELED" || pollingStatus === "TIMEOUT") && (
          <>
            <div className="text-4xl">❌</div>
            <p className="font-medium">{pollingStatus === "TIMEOUT" ? "No response yet — check M-Pesa messages or try again" : "Payment was not completed"}</p>
            <button onClick={onBack} className="mt-3 border rounded-md px-4 py-2 text-sm">Back to cart</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <button onClick={onBack} className="text-sm text-slate-500">← Back</button>
      <h1 className="text-lg font-semibold">Total: KSh {total.toLocaleString()}</h1>

      <div className="grid grid-cols-3 gap-2">
        {(["CASH", "MPESA", "CARD"] as PaymentMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-lg py-3 text-sm font-medium border ${method === m ? "bg-brand text-white border-brand" : "bg-white"}`}
          >
            {m === "MPESA" ? "M-Pesa" : m.charAt(0) + m.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {method === "MPESA" && (
        <div>
          <label className="text-sm text-slate-600">Customer phone number</label>
          <input
            placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => checkout.mutate()}
        disabled={checkout.isPending || (method === "MPESA" && !phone)}
        className="w-full bg-brand text-white rounded-md py-3 text-sm font-semibold disabled:opacity-50"
      >
        {checkout.isPending ? "Processing..." : method === "MPESA" ? "Send STK Push" : "Complete Sale"}
      </button>
    </div>
  );
}
