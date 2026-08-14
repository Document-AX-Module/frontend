import { api, BASE_URL, setAccessToken } from "./api";
import type { ProvidersResponse, User, TokenResponse } from "./types";

/** Enabled login provider keys for the /login screen (e.g. ["google"]). */
export async function getProviders(): Promise<string[]> {
  const { providers } = await api.get<ProvidersResponse>("/auth/providers");
  return providers;
}

/**
 * Full-page redirect into the backend OAuth entrypoint. The backend computes the
 * redirect_uri, bounces to the IdP, then (via its own /auth/callback) sets the
 * refresh cookie and redirects to `${frontend}/auth/callback`.
 */
export function loginWith(provider: string) {
  // External navigation to the backend origin — not internal Next routing.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${BASE_URL}/auth/login/${provider}`;
}

/** Current user (Bearer token required). */
export function getMe() {
  return api.get<User>("/auth/me");
}

/** Exchange the refresh cookie for a fresh access token; store it in memory. */
export async function bootstrapSession(): Promise<User | null> {
  try {
    const { access_token } = await api.post<TokenResponse>("/auth/token/refresh");
    setAccessToken(access_token);
    return await getMe();
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } finally {
    setAccessToken(null);
  }
}

/** Backend `/me` has no avatar/initials — derive them from name or email. */
export function initialsOf(user: Pick<User, "name" | "email">): string {
  const base = (user.name?.trim() || user.email || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}
