import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Inventory } from "./pages/Inventory";
import { Sell } from "./pages/Sell";
import { Team } from "./pages/Team";
import { Reports } from "./pages/Reports";
import { Billing } from "./pages/Billing";
import { Plugins } from "./pages/Plugins";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireOwnerOrManager({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "OWNER" && user?.role !== "MANAGER") return <Navigate to="/" replace />;
  return children;
}

function RequireOwner({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "OWNER") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/products" element={<Products />} />
        <Route path="/reports" element={<RequireOwnerOrManager><Reports /></RequireOwnerOrManager>} />
        <Route path="/billing" element={<RequireOwnerOrManager><Billing /></RequireOwnerOrManager>} />
        <Route path="/plugins" element={<RequireOwner><Plugins /></RequireOwner>} />
        <Route
          path="/inventory"
          element={
            <RequireOwnerOrManager>
              <Inventory />
            </RequireOwnerOrManager>
          }
        />
        <Route
          path="/team"
          element={
            <RequireOwnerOrManager>
              <Team />
            </RequireOwnerOrManager>
          }
        />
      </Route>
    </Routes>
  );
}
