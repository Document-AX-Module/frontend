# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

This is the **frontend** for the **AX Document Platform** — a modular AI document-work
platform that unifies per-project business documents and layers GPT + RAG features on top
of them. It is a Next.js web view that calls the FastAPI backend in the sibling `backend`
repository (`sidepjt/backend`, alongside this `sidepjt/frontend`).

The core idea: **once a document is registered into the Document Core (File → Version →
Section → Chunk → Metadata → Local Embedding), every AI feature reuses the same document
data.** The frontend surfaces those features; the backend owns parsing, chunking, local
embedding, vector search (PostgreSQL + pgvector), and GPT calls.

## Commands

```bash
npm run dev      # start dev server (Turbopack) at http://localhost:3000
npm run build    # production build
npm run start    # run the production build
npm run lint     # eslint
```

No test runner is configured yet. Always `npm run lint` and `npm run build` after changes.

## Documentation map

The details live in `docs/` (written in Korean) and are **not** auto-loaded — open the ones
that cover the code you are about to touch.

| Doc | Read it when working on |
|---|---|
| [docs/architecture.md](docs/architecture.md) | app shell, routing, `src/lib` API clients, `snake_case`/camelCase rules, document status & pipeline |
| [docs/auth.md](docs/auth.md) | login, token refresh, client-side route protection, `authLoading` gating |
| [docs/ui-guidelines.md](docs/ui-guidelines.md) | design tokens, `primitives.tsx`, modals, tiles/icons, charts, colour policy |
| [docs/api-spec.md](docs/api-spec.md) | the endpoint contract + wiring status (backend `/openapi.json` is the authority) |
| [docs/features/projects-documents.md](docs/features/projects-documents.md) | `/projects`, folder tree, upload, document detail & viewer |
| [docs/features/proofread.md](docs/features/proofread.md) | the AI panel: async proofread, finding review, applying corrections |
| [docs/features/document-diff.md](docs/features/document-diff.md) | the AI panel's 문서 비교 tab: version picker, `DiffModal` side-by-side render, change-chip navigation |
| [docs/features/dashboard.md](docs/features/dashboard.md) | `/` stat tiles, charts, pipeline strip, recent documents |
| [docs/features/activity-feed.md](docs/features/activity-feed.md) | the shared `ActivityFeed` (kind set, badge tones, document links) |
| [docs/features/notifications.md](docs/features/notifications.md) | the Topbar bell (polling), Web Push (`sw.js`, VAPID, secure context), PWA manifest |
| [docs/features/mypage.md](docs/features/mypage.md) | `/mypage` |
| [docs/features/embedding-lab.md](docs/features/embedding-lab.md) | `/embedding-lab` (admin-only): model activation/reembed, benchmark datasets/runs/apply, document migration |
| [docs/features/quiz.md](docs/features/quiz.md) | `/quiz`: question bank, quiz books, the `has_sessions` edit lock, server-session take/grade flow |
| [docs/features/rag-search.md](docs/features/rag-search.md) | `/search`: RAG chat, SSE streaming (`rag.ts`'s `queryStream`), project scope picker, conversation list/reopen, citation rendering |
| [docs/roadmap.md](docs/roadmap.md) | anything still mock: `AiPanel`'s classify/validate/related tabs; backend/platform context |

## Hard rules

Non-negotiables for every change. The reasoning is in the docs above.

1. **Types mirror the backend's Pydantic schemas in `snake_case`** (`folder_id`,
   `processing_status`) and are kept in sync by hand — there is no shared type package.
   Only three responses are camelCase: `/dashboard/summary`, `/activity`, `/mypage/summary`.
2. **Status lives on the version, not the document** — read
   `current_version.processing_status` and fall back to `"UPLOADED"` when there is no version.
   Poll loops stop at `CHUNKED`/`READY`/`FAILED` (the pipeline settles at `CHUNKED` today).
3. **Modals, not native dialogs** — `Modal` / `ConfirmDialog` / `PromptDialog` from
   `src/components/ui/Modal.tsx`, never `alert`/`confirm`/`prompt`.
4. **Reuse the shared UI** in `src/components/ui/` before writing new markup.
   `primitives.tsx` owns every enum→Korean-label map (`statusLabel`, `visibilityLabel`,
   `memberStatusLabel`, `notificationTypeLabel` + their badges) — never re-declare one at a
   call site. Use design tokens (`bg-primary`, `text-ink-muted`), not raw hex.
5. **Gate fetches on `authLoading`** from `useAuth()` in every data-loading component, or a
   reload races the token refresh and flashes a spurious "login required".
6. **Keep `docs/` in sync with the code**: a new/changed endpoint → `docs/api-spec.md`;
   a new or reworked surface → the matching `docs/features/*.md`.
