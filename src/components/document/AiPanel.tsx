"use client";

import { useEffect, useRef, useState } from "react";
import { proofread, listAnalyses, getAnalysis } from "@/lib/ai";
import { ApiError, errorMessage } from "@/lib/api";
import type { ProofreadResult } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* AI module tabs — only proofread is wired to the backend so far. */
const tabs = [
  { key: "proofread", label: "오타 검증" },
  { key: "validation", label: "규정 검증" },
  { key: "compare", label: "문서 비교" },
  { key: "related", label: "관련 문서" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const CATEGORY: Record<string, { label: string; className: string }> = {
  spelling: { label: "맞춤법", className: "bg-primary-soft text-primary" },
  spacing: { label: "띄어쓰기", className: "bg-amber-50 text-amber-700" },
  grammar: { label: "문법", className: "bg-sky-50 text-sky-700" },
  expression: { label: "표현", className: "bg-emerald-50 text-emerald-700" },
};
function cat(c: string) {
  return CATEGORY[c] ?? { label: c, className: "bg-surface-2 text-ink-muted" };
}

/** Statuses where the document isn't parsed yet — proofread would 409. */
const NOT_READY = ["UPLOADED", "PARSING"];

export function AiPanel({
  docId,
  status,
  onFocusSection,
}: {
  docId: string;
  status: string;
  onFocusSection?: (sectionId: number) => void;
}) {
  const [active, setActive] = useState<TabKey>("proofread");

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-border px-3 pt-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`rounded-t-lg px-3 py-2 text-sm transition-colors ${
              active === t.key
                ? "border-b-2 border-primary font-medium text-primary"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active === "proofread" && (
          <ProofreadPanel docId={docId} status={status} onFocusSection={onFocusSection} />
        )}
        {active === "validation" && <Placeholder title="규정 검증" desc="관련 RULE 문서를 검색해 GPT로 위반·주의 사항을 검증합니다. (준비 중)" />}
        {active === "compare" && <Placeholder title="문서 비교" desc="다른 버전과 섹션을 매칭해 변경 사항을 요약합니다. (준비 중)" />}
        {active === "related" && <Placeholder title="관련 문서" desc="문서 임베딩 기반 유사도로 연관 문서를 추천합니다. (준비 중)" />}
      </div>
    </div>
  );
}

function ProofreadPanel({
  docId,
  status,
  onFocusSection,
}: {
  docId: string;
  status: string;
  onFocusSection?: (sectionId: number) => void;
}) {
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !NOT_READY.includes(status);
  // Cancellation token for the in-flight poll loop.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);

  function stopPolling() {
    if (pollRef.current) pollRef.current.cancelled = true;
  }

  /** Poll an analysis until it COMPLETED/FAILED (proofread runs async, 202 → RUNNING). */
  async function poll(analysisId: number) {
    stopPolling();
    const token = { cancelled: false };
    pollRef.current = token;
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      if (token.cancelled) return;
      let full: ProofreadResult;
      try {
        full = await getAnalysis(docId, analysisId);
      } catch {
        continue;
      }
      if (token.cancelled) return;
      setResult(full);
      if (full.status === "COMPLETED" || full.status === "FAILED") {
        setRunning(false);
        if (full.status === "FAILED") setError(full.error || "오타 검증에 실패했습니다.");
        return;
      }
    }
    setRunning(false); // timed out
  }

  // Load the most recent analysis; resume polling if it's still running.
  useEffect(() => {
    let cancelled = false;
    listAnalyses(docId, "proofread")
      .then(async (list) => {
        const latest = list.sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
        )[0];
        if (!latest || cancelled) return;
        const full = await getAnalysis(docId, latest.id);
        if (cancelled) return;
        setResult(full);
        if (full.status === "RUNNING") {
          setRunning(true);
          void poll(full.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const started = await proofread(docId); // 202 → RUNNING record
      setResult(started);
      if (started.status === "COMPLETED" || started.status === "FAILED") {
        setRunning(false);
        if (started.status === "FAILED") setError(started.error || "오타 검증에 실패했습니다.");
      } else {
        void poll(started.id);
      }
    } catch (e) {
      setRunning(false);
      if (e instanceof ApiError && e.status === 409) {
        setError("문서 분석이 끝난 뒤에 실행할 수 있어요.");
      } else {
        setError(errorMessage(e, "오타 검증에 실패했습니다."));
      }
    }
  }

  const counts = result
    ? result.findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.category] = (acc[f.category] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4">
        <button
          type="button"
          onClick={run}
          disabled={running || !ready}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {running ? "검사 중…" : result ? "다시 검사" : "AI 오타 검사 실행"}
        </button>
        {!ready && <p className="text-xs text-ink-muted">문서 분석이 끝나면 실행할 수 있어요.</p>}
        {error && <p className="text-sm text-primary">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {running || result?.status === "RUNNING" ? (
          <div className="flex flex-col items-center gap-2 pt-10 text-center text-sm text-ink-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            검사 중… 백그라운드에서 처리하고 있어요.
          </div>
        ) : !result || result.status === "FAILED" ? (
          <p className="pt-8 text-center text-sm text-ink-muted">
            {result?.status === "FAILED" ? "검사에 실패했습니다." : "아직 검사 결과가 없습니다."}
          </p>
        ) : result.findings.length === 0 ? (
          <p className="pt-8 text-center text-sm text-ink-muted">발견된 문제가 없습니다</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {Object.entries(counts).map(([c, n]) => (
                <span key={c} className={`rounded-md px-2 py-0.5 font-medium ${cat(c).className}`}>
                  {cat(c).label} {n}
                </span>
              ))}
              <span className="ml-auto text-ink-muted">
                {result.provider === "openai" ? "GPT" : "규칙기반"} · 섹션 {result.sections_scanned}개
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {result.findings.map((f, i) => {
                const jump =
                  f.section_id != null && onFocusSection
                    ? () => onFocusSection(f.section_id!)
                    : undefined;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={jump}
                      disabled={!jump}
                      className={`w-full rounded-lg border border-border p-3 text-left text-sm transition-colors ${
                        jump ? "cursor-pointer hover:border-primary/40 hover:bg-surface" : "cursor-default"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cat(f.category).className}`}>
                          {cat(f.category).label}
                        </span>
                        {f.page_start != null && (
                          <span className="text-[11px] text-ink-muted">p.{f.page_start}</span>
                        )}
                        {jump && <span className="ml-auto text-[11px] text-primary">본문 보기 →</span>}
                      </div>
                      <p>
                        <span className="text-ink-muted line-through">{f.original}</span>
                        <span className="mx-1.5 text-ink-muted">→</span>
                        <span className="font-medium text-ink">{f.suggestion}</span>
                      </p>
                      {f.reason && <p className="mt-1 text-xs text-ink-muted">{f.reason}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="grid h-full place-items-center py-16 text-center">
      <div className="max-w-xs">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-xs text-ink-muted">{desc}</p>
      </div>
    </div>
  );
}
