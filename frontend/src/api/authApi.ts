import { apiFetch } from "./client";
import type { LoginRequest, SignupRequest, TokenResponse, UserOut } from "../types/auth";

export function login(body: LoginRequest) {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function signup(body: SignupRequest) {
  return apiFetch<TokenResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMe() {
  return apiFetch<UserOut>("/auth/me");
}
