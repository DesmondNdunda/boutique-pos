import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../store/auth";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: "", ownerName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form);
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="bg-white shadow-sm rounded-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-center">Create your store</h1>
        {(["organizationName", "ownerName", "email", "password"] as const).map((field) => (
          <div key={field}>
            <label className="text-sm text-slate-600 capitalize">
              {field === "organizationName" ? "Store name" : field === "ownerName" ? "Your name" : field}
            </label>
            <input
              type={field === "email" ? "email" : field === "password" ? "password" : "text"}
              required
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
            />
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
          {loading ? <><span className="loading-spinner mr-2" aria-hidden="true" />Creating...</> : "Create store"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Already have a store? <Link to="/login" className="text-brand font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
