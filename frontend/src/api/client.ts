import { useAuthStore } from "../store/authStore";

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error(
    "VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env for local dev.",
  );
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function detailFromBody(body: unknown, fallback: string): string {
  if (typeof body === "object" && body && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : JSON.stringify(item),
        )
        .join("; ");
    }
    if (detail != null) return JSON.stringify(detail);
  }
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. It may be waking up — wait a moment and try again.",
    );
  }

  if (res.status === 401) {
    useAuthStore.getState().clearSession();
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.status === 401) {
      throw new ApiError(401, "Invalid email or password", body);
    }
    if (res.status === 403) {
      throw new ApiError(403, detailFromBody(body, "You do not have access to do that."), body);
    }
    if (res.status >= 500) {
      throw new ApiError(
        res.status,
        detailFromBody(body, "Something went wrong on the server. Please try again."),
        body,
      );
    }
    throw new ApiError(res.status, detailFromBody(body, res.statusText || "Request failed"), body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
