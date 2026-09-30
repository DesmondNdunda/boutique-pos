import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../store/auth";
import { InstallAppButton } from "../components/InstallAppButton";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
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
        <div className="flex flex-col items-center gap-2">
          <img src="/ashler-trends-logo.jpeg" alt="Ashler Trends logo" className="h-28 w-28 rounded-full object-cover" />
          <h1 className="text-xl font-semibold text-center">Ashler Trends</h1>
          <InstallAppButton variant="light" />
        </div>
        <div>
          <label className="text-sm text-slate-600">Email or name</label>
          <input
            type="text" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com" className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-slate-600">Password</label>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 pr-16 text-sm"
            />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-3 text-xs text-slate-500" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
          {loading ? <><span className="loading-spinner mr-2" aria-hidden="true" />Signing in...</> : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-500">
          New here? <Link to="/register" className="text-brand font-medium">Create your store</Link>
        </p>
      </form>
    </div>
  );
}
