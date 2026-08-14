import type { ReactNode } from "react";
import Link from "next/link";
import type { DocStatus } from "@/lib/types";

export type { DocStatus };

/** Error banner. Shows a login link only when the failure is an auth error. */
export function ErrorBanner({
  message,
  needLogin = false,
}: {
  message: string;
  needLogin?: boolean;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary">
      {message}
      {needLogin && (
        <>
          {" — 로그인이 필요합니다. "}
          <Link href="/login" className="font-medium underline">
            로그인
          </Link>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared skeleton UI primitives. Presentational only — no data yet.  */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-canvas ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink">{children}</h2>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost";
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles = {
    primary:
      "bg-primary text-white hover:bg-primary-hover",
    outline:
      "border border-border bg-canvas text-ink hover:bg-surface",
    ghost: "text-ink-muted hover:bg-surface hover:text-ink",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* Document processing status styles — `DocStatus` mirrors backend `processing_status`. */
const STATUS_STYLES: Record<DocStatus, { label: string; className: string }> = {
  UPLOADED: { label: "업로드됨", className: "bg-surface-2 text-ink-muted" },
  PARSING: { label: "분석 중", className: "bg-amber-50 text-amber-700" },
  PARSED: { label: "분석 완료", className: "bg-amber-50 text-amber-700" },
  CHUNKING: { label: "청킹 중", className: "bg-sky-50 text-sky-700" },
  CHUNKED: { label: "청킹 완료", className: "bg-sky-50 text-sky-700" },
  EMBEDDING: { label: "임베딩 중", className: "bg-sky-50 text-sky-700" },
  READY: { label: "준비 완료", className: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "실패", className: "bg-primary-soft text-primary" },
};

export function StatusBadge({ status }: { status: DocStatus | string }) {
  // Tolerate unknown/raw status strings from the backend.
  const s = STATUS_STYLES[status as DocStatus] ?? {
    label: status,
    className: "bg-surface-2 text-ink-muted",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">
      {children}
    </span>
  );
}
