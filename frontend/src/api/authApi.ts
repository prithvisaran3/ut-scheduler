import { apiFetch } from "./client";
import type { LoginRequest, TokenResponse, UserOut } from "../types/auth";

export function login(body: LoginRequest) {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMe() {
  return apiFetch<UserOut>("/auth/me");
}
