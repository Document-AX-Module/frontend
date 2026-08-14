"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { listProjects, createProject, deleteProject } from "@/lib/projects";
import { errorMessage, isAuthError } from "@/lib/api";
import type { Project } from "@/lib/types";
import { PageHeader, Card, Button, ErrorBanner } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useAuth } from "@/components/auth/AuthProvider";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setNeedLogin(false);
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(errorMessage(e, "프로젝트를 불러오지 못했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  const { loading: authLoading } = useAuth();

  // Wait for the auth session (access token) before fetching, so reloads don't
  // race the token refresh and flash a spurious "login required".
  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [authLoading]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const created = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setProjects((prev) => [created, ...prev]);
      setName("");
      setDescription("");
      setShowForm(false);
    } catch (e) {
      setError(errorMessage(e, "프로젝트 생성에 실패했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteBusy(true);
    try {
      await deleteProject(String(target.id));
      setProjects((p) => p.filter((x) => x.id !== target.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(errorMessage(e, "삭제에 실패했습니다."));
      setNeedLogin(isAuthError(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="프로젝트"
        description="프로젝트별로 폴더와 문서를 구성하고 AI 기능을 적용합니다."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "닫기" : "＋ 새 프로젝트"}
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="프로젝트 이름"
              className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted"
              autoFocus
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "생성 중…" : "생성"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} needLogin={needLogin} />}

      {loading ? (
        <Card className="grid place-items-center py-16 text-sm text-ink-muted">불러오는 중…</Card>
      ) : projects.length === 0 && !error ? (
        <Card className="grid place-items-center gap-1 py-16 text-center">
          <p className="text-sm font-medium text-ink">아직 프로젝트가 없습니다.</p>
          <p className="text-xs text-ink-muted">＋ 새 프로젝트로 시작하세요.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className="flex flex-col p-5 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/projects/${p.id}`}
                    className="text-base font-semibold text-ink hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    {p.description || "설명 없음"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
                  className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface hover:text-primary"
                >
                  삭제
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-ink-muted">
                <span>생성 {fmtDate(p.created_at)}</span>
                <Link href={`/projects/${p.id}`} className="font-medium text-primary hover:underline">
                  열기 →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="프로젝트 삭제"
        message={`"${deleteTarget?.name}" 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteBusy}
      />
    </div>
  );
}
