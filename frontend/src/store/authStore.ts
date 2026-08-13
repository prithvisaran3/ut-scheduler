import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "../types/auth";

interface AuthState {
  token: string | null;
  role: UserRole | null;
  fullName: string | null;
  setSession: (payload: { token: string; role: UserRole; fullName: string }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      fullName: null,
      setSession: ({ token, role, fullName }) => set({ token, role, fullName }),
      clearSession: () => set({ token: null, role: null, fullName: null }),
    }),
    { name: "ut-scheduler-auth" },
  ),
);
