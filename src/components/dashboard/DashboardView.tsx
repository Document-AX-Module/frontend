"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSummary, getActivity } from "@/lib/dashboard";
import { listRecentDocuments } from "@/lib/documents";
import { errorMessage, isAuthError } from "@/lib/api";
import { initialsOf } from "@/lib/auth";
import type { ActivityItem, DashboardSummary, DocStatus, RecentDocument } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  ErrorBanner,
  StatusBadge,
  statusLabel,
} from "@/components/ui/primitives";
import { AreaTrend, BarList, PipelineStrip } from "@/components/charts";
import { useAuth } from "@/components/auth/AuthProvider";

const POLL_MS = 15_000;

/** `weeklyProcessing` buckets by **UTC** day, so the labels must be UTC too. */
function weekdayLabels(len: number): string[] {
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const today = new Date();
  return Array.from({ length: len }, (_, i) => {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (len - 1 - i)),
    );
    return names[d.getUTCDay()];
  });
}

const STAGE_TONE: Record<DocStatus, "done" | "active" | "idle" | "fail"> = {
  UPLOADED: "idle",
  PARSING: "active",
  PARSED: "idle",
  // Parked, not finished — the pipeline settles here until Phase 9.
  CHUNKED: "idle",
  CHUNKING: "active",
  EMBEDDING: "active",
  READY: "done",
  FAILED: "fail",
};

/**
 * The backend emits 11 activity kinds, so they fold into four tones — the badge
 * text already names the kind, so colour carries class, not identity. Amber was
 * the first pick for `analysis` but sits ΔE 10.6 from the brand red, under the
 * 15 normal-vision floor; don't reintroduce it alongside `destructive`.
 */
const TONE = {
  destructive: "bg-primary-soft text-primary",
  analysis: "bg-violet-50 text-violet-700",
  change: "bg-sky-50 text-sky-700",
  quiet: "bg-surface-2 text-ink-muted",
} as const;

const KIND_TONE: Record<string, keyof typeof TONE> = {
  삭제: "destructive",
  오타: "analysis",
  규정: "analysis",
  분류: "analysis",
  추천: "analysis",
  분석: "analysis",
  업로드: "change",
  프로젝트: "change",
  폴더: "change",
  로그인: "quiet",
  기타: "quiet",
};

/**
 * Both clauses are load-bearing: ids are per-table, so a `project`-typed row's
 * `targetId` would open an unrelated *document* (a silent 200 on the wrong file),
 * and logs outlive their targets, so `targetAlive` is what rules out deleted ones.
 * Deliberately no `kind` check — `kind` is display copy and would break silently.
 */
function canLinkToDocument(a: ActivityItem): a is ActivityItem & { targetId: number } {
  return a.targetType === "document" && a.targetId != null && a.targetAlive;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

export function DashboardView() {
  const { user, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const [s, a, r] = await Promise.all([
        getSummary(),
        getActivity(10),
        listRecentDocuments(5),
      ]);
      setSummary(s);
      setActivity(a);
      setRecent(r);
      setError(null);
      setNeedLogin(false);
    } catch (e) {
      setError(errorMessage(e, "대시보드를 불러오지 못했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Gate on the auth session so a reload doesn't flash a spurious "login required".
  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [authLoading, load]);

  const processing = summary?.stats.processing ?? 0;
  useEffect(() => {
    if (processing === 0) return;
    const id = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(id);
  }, [processing, load]);

  if (authLoading || (loading && !summary)) {
    return <DashboardSkeleton />;
  }

  if (error && !summary) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorBanner message={error} needLogin={needLogin} />
      </div>
    );
  }

  const stats = summary?.stats;
  const weekly = summary?.weeklyProcessing ?? [];
  const weeklyTotal = weekly.reduce((a, b) => a + b, 0);
  const types = summary?.documentTypes ?? [];
  const stages = (summary?.pipeline ?? []).map((p) => ({
    label: statusLabel(p.status),
    count: p.count,
    tone: STAGE_TONE[p.status] ?? "idle",
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-r from-primary-soft to-canvas px-6 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            안녕하세요, {user?.name?.trim() || ""} 님
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {processing > 0 ? (
              <>
                지금 <span className="font-medium text-primary">{processing}건</span>의 문서가
                처리 중입니다.
              </>
            ) : (
              <>
                등록된 문서 <span className="font-medium text-primary">{stats?.documents ?? 0}건</span>
                {" · 처리 중인 문서는 없습니다."}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/projects">
            <Button>＋ 새 프로젝트</Button>
          </Link>
        </div>
      </div>

      {/* Stat tiles — no trend badges: the API has no historical deltas to derive them from. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="프로젝트" value={stats?.projects ?? 0} />
        <StatTile label="문서" value={stats?.documents ?? 0} />
        <StatTile label="처리 중" value={processing} />
        <StatTile label="오늘 RAG 질의" value={stats?.ragToday ?? 0} note="RAG 미구현" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>주간 문서 처리량</CardTitle>
            <span className="text-xs text-ink-muted">최근 7일 · 총 {weeklyTotal}건</span>
          </CardHeader>
          <div className="p-4">
            {weekly.length > 0 ? (
              <AreaTrend data={weekly} labels={weekdayLabels(weekly.length)} />
            ) : (
              <Empty>표시할 처리 이력이 없습니다.</Empty>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>문서 유형 분포</CardTitle>
          </CardHeader>
          <div className="p-5">
            {types.length > 0 ? (
              <BarList items={types} />
            ) : (
              <Empty>등록된 문서가 없습니다.</Empty>
            )}
          </div>
        </Card>
      </div>

      {/* Pipeline */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>문서 처리 파이프라인</CardTitle>
          <span className="text-xs text-ink-muted">
            {processing > 0 ? "실시간 처리 현황" : "현재 버전 기준"}
          </span>
        </div>
        {stages.length > 0 ? <PipelineStrip stages={stages} /> : <Empty>집계할 문서가 없습니다.</Empty>}
      </Card>

      {/* Recent docs + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>최근 문서</CardTitle>
            <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
              전체 보기
            </Link>
          </CardHeader>
          {recent.length > 0 ? (
            <ul className="divide-y divide-border">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/documents/${d.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">
                        <IconDoc />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                        <p className="truncate text-xs text-ink-muted">{d.project_name}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={d.processing_status} />
                      <span className="text-[11px] text-ink-muted">
                        {relativeTime(d.created_at)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10">
              <Empty>
                아직 등록된 문서가 없습니다.{" "}
                <Link href="/projects" className="font-medium text-primary hover:underline">
                  프로젝트
                </Link>
                에서 업로드하세요.
              </Empty>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
            <span className="text-xs text-ink-muted">업로드 · AI 분석</span>
          </CardHeader>
          {activity.length > 0 ? (
            <ul className="divide-y divide-border">
              {activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
                    {initialsOf({ name: a.actor, email: a.actor })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="font-medium">{a.actor}</span>
                      <span className="text-ink-muted"> · {a.action}</span>
                    </p>
                    {/* `로그인`처럼 대상이 없는 활동은 `target`이 빈 문자열이다. */}
                    {a.target &&
                      (canLinkToDocument(a) ? (
                        <Link
                          href={`/documents/${a.targetId}`}
                          className="block truncate text-xs text-ink-muted hover:text-primary hover:underline"
                        >
                          {a.target}
                        </Link>
                      ) : (
                        <p className="truncate text-xs text-ink-muted">{a.target}</p>
                      ))}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                        TONE[KIND_TONE[a.kind] ?? "quiet"]
                      }`}
                    >
                      {a.kind}
                    </span>
                    <span className="text-[11px] text-ink-muted">{relativeTime(a.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10">
              <Empty>아직 활동 기록이 없습니다.</Empty>
            </div>
          )}
        </Card>
      </div>

      {/* A refresh that fails after the first paint shouldn't wipe the numbers. */}
      {error && summary && <ErrorBanner message={error} needLogin={needLogin} />}
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-muted">{label}</p>
        {note && (
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
            {note}
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">
        {value.toLocaleString("ko-KR")}
      </p>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-sm text-ink-muted">{children}</p>;
}

function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-6">
      <div className="h-[104px] rounded-2xl border border-border bg-surface" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[92px] rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-[248px] rounded-xl border border-border bg-surface lg:col-span-2" />
        <div className="h-[248px] rounded-xl border border-border bg-surface" />
      </div>
      <div className="h-[132px] rounded-xl border border-border bg-surface" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-[280px] rounded-xl border border-border bg-surface" />
        <div className="h-[280px] rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}
