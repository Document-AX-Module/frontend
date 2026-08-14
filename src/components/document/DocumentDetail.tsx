"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDocument, downloadDocument } from "@/lib/documents";
import { listVersions, getSections } from "@/lib/versions";
import { errorMessage, isAuthError } from "@/lib/api";
import type { Document, DocumentVersion, Section } from "@/lib/types";
import { StatusBadge, ErrorBanner } from "@/components/ui/primitives";
import { AiPanel } from "./AiPanel";
import { useAuth } from "@/components/auth/AuthProvider";

/** Pipeline currently settles at CHUNKED (embedding is Phase 9), so stop polling there. */
const POLL_STOP = ["READY", "FAILED", "CHUNKED"];

function fmtSize(bytes?: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("ko-KR") : "—";
}

export function DocumentDetail({ docId }: { docId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
      setNeedLogin(false);
    }
    try {
      const d = await getDocument(docId);
      setDoc(d);
      const vs = await listVersions(docId).catch(() => [] as DocumentVersion[]);
      setVersions(vs);
      const cv =
        d.current_version ?? vs.find((v) => v.id === d.current_version_id) ?? vs[0] ?? null;
      setSections(cv ? await getSections(cv.id).catch(() => [] as Section[]) : []);
    } catch (e) {
      setError(errorMessage(e, "문서를 불러오지 못했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const { loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, authLoading]);

  const version =
    doc?.current_version ??
    versions.find((v) => v.id === doc?.current_version_id) ??
    versions[0] ??
    null;
  const status = version?.processing_status ?? doc?.status ?? "";

  // Auto-refresh while the document is still processing.
  useEffect(() => {
    if (!status || POLL_STOP.includes(status)) return;
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.order_no - b.order_no),
    [sections],
  );
  function depthOf(s: Section) {
    let depth = 0;
    let cur: Section | undefined = s;
    while (cur && cur.parent_section_id != null && depth < 6) {
      cur = byId.get(cur.parent_section_id);
      depth += 1;
    }
    return depth;
  }
  const titleOf = (s: Section) => s.title?.trim() ?? "";
  const hasTitle = (s: Section) => titleOf(s).length > 0;
  // Outline only lists real headings (titled sections), not every paragraph.
  const outline = useMemo(
    () => ordered.filter((s) => (s.title?.trim() ?? "").length > 0),
    [ordered],
  );

  /** Scroll the viewer to a section and briefly highlight it. */
  function focusSection(sectionId: number) {
    document.getElementById(`sec-${sectionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setHighlightId(sectionId);
    window.setTimeout(() => setHighlightId((cur) => (cur === sectionId ? null : cur)), 2200);
  }

  async function onDownload() {
    setDownloading(true);
    try {
      await downloadDocument(docId, version?.original_file_name);
    } catch (e) {
      setError(errorMessage(e, "다운로드에 실패했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto grid max-w-7xl place-items-center py-24 text-sm text-ink-muted">
        불러오는 중…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-7xl">
        <Link href="/projects" className="text-xs text-ink-muted hover:text-primary">
          ← 프로젝트
        </Link>
        <div className="mt-4">
          <ErrorBanner message={error ?? "문서를 찾을 수 없습니다."} needLogin={needLogin} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href={`/projects/${doc.project_id}`} className="text-xs text-ink-muted hover:text-primary">
          ← 프로젝트
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{doc.name}</h1>
          {version && (
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">
              V{version.version_no}
            </span>
          )}
          {doc.document_type && (
            <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-white">
              {doc.document_type}
            </span>
          )}
          <StatusBadge status={status} />
          <span className="text-xs text-ink-muted">#{doc.id}</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface disabled:opacity-50"
            >
              {downloading ? "다운로드 중…" : "다운로드"}
            </button>
          </div>
        </div>
        {doc.description && <p className="text-sm text-ink-muted">{doc.description}</p>}
      </div>

      {error && <ErrorBanner message={error} needLogin={needLogin} />}

      {/* 3-pane: outline · viewer · AI panel */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_380px]">
        {/* Metadata (always visible) on top · outline scrolls below */}
        <div className="hidden min-h-0 flex-col gap-4 lg:flex">
          <div className="shrink-0 rounded-xl border border-border bg-canvas p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">메타데이터</p>
            <dl className="flex flex-col gap-2 text-xs">
              <MetaRow k="유형" v={doc.document_type ?? "—"} />
              <MetaRow k="버전" v={version ? `V${version.version_no}` : "—"} />
              <MetaRow k="파일" v={version?.original_file_name ?? "—"} />
              <MetaRow k="크기" v={fmtSize(version?.file_size)} />
              <MetaRow k="섹션" v={`${sections.length}개`} />
              <MetaRow k="버전 수" v={`${versions.length}개`} />
              <MetaRow k="작성자" v={doc.author?.name || doc.author?.email || doc.created_by || "—"} />
              <MetaRow k="업로드" v={fmtDate(doc.created_at)} />
            </dl>
            {doc.description && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">설명</p>
                <p className="whitespace-pre-wrap text-sm text-ink">{doc.description}</p>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-canvas p-4">
            <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-muted">문서 개요</p>
            {outline.length === 0 ? (
              <p className="text-xs text-ink-muted">
                {ordered.length === 0 ? "아직 섹션이 없습니다." : "제목이 있는 섹션이 없습니다."}
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {outline.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#sec-${s.id}`}
                      style={{ paddingLeft: 8 + depthOf(s) * 12 }}
                      className="block truncate rounded-md py-1.5 pr-2 text-sm text-ink-muted hover:bg-surface hover:text-ink"
                    >
                      {titleOf(s)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Viewer */}
        <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-canvas p-8">
          {ordered.length === 0 ? (
            <div className="grid h-full place-items-center py-16 text-center">
              <div>
                <StatusBadge status={status} />
                <p className="mt-3 text-sm text-ink-muted">
                  {status === "FAILED"
                    ? "문서 처리에 실패했습니다."
                    : POLL_STOP.includes(status)
                      ? "표시할 섹션이 없습니다."
                      : "문서를 분석하고 있습니다…"}
                </p>
              </div>
            </div>
          ) : (
            <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm leading-7 text-ink">
              {ordered.map((s) => (
                <section
                  key={s.id}
                  id={`sec-${s.id}`}
                  className={`scroll-mt-4 rounded-lg transition-colors ${
                    highlightId === s.id ? "bg-primary-soft ring-2 ring-primary/40" : ""
                  }`}
                >
                  {hasTitle(s) && (
                    <p
                      className="font-medium text-ink-muted"
                      style={{ paddingLeft: depthOf(s) * 12 }}
                    >
                      {titleOf(s)}
                    </p>
                  )}
                  {s.content && <p className="whitespace-pre-wrap text-ink">{s.content}</p>}
                </section>
              ))}
            </article>
          )}
        </div>

        {/* AI panel — proofread is wired; other modules are placeholders */}
        <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-canvas">
          <AiPanel docId={docId} status={status} onFocusSection={focusSection} />
        </div>
      </div>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-ink-muted">{k}</dt>
      <dd className="truncate text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
