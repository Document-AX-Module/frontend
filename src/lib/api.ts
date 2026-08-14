/*
 * Typed fetch wrapper for the AX backend.
 * - Base URL from NEXT_PUBLIC_API_BASE_URL (+ /api/v1), defaults to localhost:8000.
 * - Injects `Authorization: Bearer <access>` and sends cookies (refresh token).
 * - On 401, transparently refreshes the access token once and retries.
 */

const BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "") +
  "/api/v1";

/* --- access token lives in memory (refresh token is an httpOnly cookie) --- */
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** True only for auth failures (401/403) — used to decide whether to prompt login. */
export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

/** Human-readable message from any thrown value. */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

const REFRESH_PATH = "/auth/token/refresh";

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string };
    if (data.access_token) {
      setAccessToken(data.access_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** multipart/form-data upload — pass a FormData as body and set this true */
  form?: boolean;
  /** internal: prevents infinite refresh recursion */
  _retried?: boolean;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, form, _retried, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (accessToken) finalHeaders.set("Authorization", `Bearer ${accessToken}`);

  let payload: BodyInit | undefined;
  if (form) {
    payload = body as FormData; // browser sets multipart boundary
  } else if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: payload,
    credentials: "include",
  });

  // Refresh-and-retry once on 401 (except for the refresh call itself).
  if (res.status === 401 && !_retried && path !== REFRESH_PATH) {
    if (await tryRefresh()) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export { BASE_URL };
