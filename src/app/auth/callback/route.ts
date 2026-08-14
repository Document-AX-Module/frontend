import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * OAuth landing on the frontend. The backend sets the httpOnly refresh cookie
 * during its own /auth/callback, then redirects here. We simply bounce to the
 * intended destination — AuthProvider bootstraps the session (refresh → me)
 * from the cookie on the next render.
 */
export function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") || "/";
  // Only allow same-origin relative paths to avoid open redirects.
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(dest, request.url));
}
