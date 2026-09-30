import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Team() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "EMPLOYEE" as "EMPLOYEE" | "MANAGER" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data.users,
  });

  const invite = useMutation({
    mutationFn: async () => (await api.post("/auth/users", form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setShowForm(false); setForm({ name: "", email: "", password: "", role: "EMPLOYEE" }); setError(null); setSuccess("Staff member added successfully."); },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Team</h1>
        <button onClick={() => setShowForm(true)} className="bg-brand text-white text-sm rounded-md px-3 py-2">+ Add Staff</button>
      </div>
      {success && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}<button className="ml-3" onClick={() => setSuccess(null)} aria-label="Dismiss">×</button></p>}

      <div className="space-y-2">
        {users?.map((u: any) => (
          <div key={u.id} className="bg-white border rounded-lg px-3 py-2 flex justify-between items-center">
            <div>
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <span className="text-xs bg-slate-100 rounded-full px-2 py-1">{u.role}</span>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-3">
            <h2 className="font-semibold">Add Staff</h2>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            <input placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
            </select>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 border rounded-md py-2 text-sm">Cancel</button>
              <button onClick={() => invite.mutate()} disabled={invite.isPending} className="flex-1 bg-brand text-white rounded-md py-2 text-sm disabled:opacity-50">
                {invite.isPending ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
