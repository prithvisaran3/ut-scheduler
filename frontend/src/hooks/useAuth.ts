import { useMutation } from "@tanstack/react-query";
import * as authApi from "../api/authApi";
import { useAuthStore } from "../store/authStore";
import type { LoginRequest, SignupRequest } from "../types/auth";

function applySession(
  setSession: (s: { token: string; role: "admin" | "patient"; fullName: string }) => void,
  data: { access_token: string; role: "admin" | "patient"; full_name: string },
) {
  setSession({
    token: data.access_token,
    role: data.role,
    fullName: data.full_name,
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: (data) => applySession(setSession, data),
  });
}

export function useSignup() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body: SignupRequest) => authApi.signup(body),
    onSuccess: (data) => applySession(setSession, data),
  });
}

export function useLogout() {
  const clearSession = useAuthStore((s) => s.clearSession);
  return () => clearSession();
}
