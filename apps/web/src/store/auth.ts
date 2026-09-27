import { create } from "zustand";
import type { PublicUser } from "@boutique-pos/shared";
import { api } from "../lib/api";

interface AuthState {
  user: PublicUser | null;
  activeBranchId: string | null;
  loading: boolean;
  fetchMe: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: { organizationName: string; ownerName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  setActiveBranch: (id: string) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  activeBranchId: null,
  loading: true,

  fetchMe: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data.user, activeBranchId: data.user.branchId, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    set({ user: data.user, activeBranchId: data.user.branchId });
  },

  register: async (input) => {
    const { data } = await api.post("/auth/register", input);
    set({ user: data.user, activeBranchId: data.user.branchId });
  },

  logout: async () => {
    await api.post("/auth/logout");
    set({ user: null, activeBranchId: null });
  },

  setActiveBranch: (id) => set({ activeBranchId: id }),
}));
