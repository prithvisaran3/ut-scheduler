export type UserRole = "admin" | "patient";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  full_name: string;
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  full_name: string;
}

export interface UserOut {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at?: string | null;
}
