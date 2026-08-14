"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/components/auth/AuthProvider";

/** Routes that render without the app shell (sidebar/topbar). */
const BARE_PREFIXES = ["/login", "/auth"];

/*
 * Client-side auth guard. The refresh cookie is owned by the backend origin, so
 * the frontend can't gate routes in a proxy/middleware — it must react to the
 * hydrated session instead. Enabled via NEXT_PUBLIC_AUTH_ENABLED so the mock UI
 * stays viewable while auth is off.
 */
const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const bare = BARE_PREFIXES.some((p) => pathname.startsWith(p));
  const needsAuth = AUTH_ENABLED && !bare;

  useEffect(() => {
    if (needsAuth && !loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [needsAuth, loading, user, pathname, router]);

  if (bare) return <>{children}</>;

  // Block protected content until the session is known / present.
  if (needsAuth && (loading || !user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface text-sm text-ink-muted">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-surface px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
