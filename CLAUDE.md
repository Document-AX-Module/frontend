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

## Architecture

- App Router (`src/app`), TypeScript, Tailwind CSS v4, import alias `@/*` → `src/*`.
- `turbopack.root` is pinned to this directory in `next.config.ts` so Turbopack doesn't pick
  up a stray lockfile in a parent directory.
- **Brand theme** (PCN): base white, black ink, deep-red accent. Design tokens live in
  `src/app/globals.css` under Tailwind v4 `@theme` (`--color-primary #b01c2e`, `canvas`,
  `surface`, `ink`, `ink-muted`, `border`…). Use `bg-primary`, `text-ink-muted`, etc.
- **App shell**: `src/app/layout.tsx` wraps everything in `AuthProvider` → `AppChrome`
  (`src/components/layout/`). `AppChrome` renders the `Sidebar` + `Topbar` shell, except on
  bare routes (`/login`, `/auth/*`).

### API client layer (`src/lib/`)

One typed module per backend domain. **Types mirror the backend's Pydantic schemas in
`snake_case`** (e.g. `folder_id`, `processing_status`) — keep them in sync manually; the
repos aren't linked by a shared type package. The backend's `/openapi.json` (+ `/docs`) is
the authority.

- `api.ts` — fetch wrapper. Prepends `NEXT_PUBLIC_API_BASE_URL` + `/api/v1`, injects
  `Authorization: Bearer <access>`, sends cookies, and on **401 auto-refreshes once and
  retries**. Exports `ApiError`, `isAuthError` (401/403 only), `errorMessage`,
  `getAccessToken`/`setAccessToken`.
- `types.ts` — shared types (`Project`, `Folder`, `Document`, `DocumentVersion`, `Section`,
  `DocStatus`, `ProofreadResult`…).
- Domain clients: `auth.ts`, `projects.ts`, `documents.ts`, `versions.ts`, `ai.ts`,
  `dashboard.ts`, `rag.ts`, `embedding.ts`.

### Authentication (FastAPI-owned JWT)

The backend runs the OAuth2 flow (`google` + a dev `mock` provider) and issues a short-lived
**access JWT** (kept in memory in `api.ts`) plus a **`refresh_token` httpOnly cookie** owned
by the backend origin.

- `AuthProvider` (`src/components/auth/`) bootstraps the session on mount:
  `POST /auth/token/refresh` (via cookie) → `getMe()`. `/me` has no avatar, so
  `initialsOf()` derives initials from name/email.
- Login flow: `/login` (`getProviders` → provider buttons) → `loginWith(provider)` navigates
  to the backend → backend sets the cookie and redirects to `/auth/callback` (a route handler
  that bounces to `/`).
- **Route protection is client-side**, not middleware — the refresh cookie belongs to the
  backend origin (`:8000`), so a Next proxy on `:3000` can't see it. `AppChrome` redirects
  unauthenticated users to `/login` **only when `NEXT_PUBLIC_AUTH_ENABLED === "true"`**
  (default off so the UI is viewable without a backend). There is no `proxy.ts`/middleware.
- **Data components gate their fetches on `authLoading`** (from `useAuth()`) so reloads don't
  race the token refresh and flash a spurious "login required". Follow this pattern in new
  data-loading components.

### Current state (what's wired vs mock)

Real, wired to the backend (all require login — set `NEXT_PUBLIC_AUTH_ENABLED=true`):

- **Projects** (`/projects`) — list / create / delete. `ProjectsView`.
- **Project documents** (`/projects/[id]`) — `ProjectDocuments`: folder **tree**
  (`FolderTree`, `parent_id`-based, create/rename/delete; selecting a folder filters docs incl.
  descendants), document list, **upload modal** (`UploadDialog`: drag-drop, image/PDF/text
  preview, title, folder, description), status polling, delete.
- **Document detail** (`/documents/[id]`) — `DocumentDetail`: metadata (+description) + section
  **outline** + **viewer** (renders parsed `sections`; untitled sections render body only) +
  authenticated **download**; auto-refreshes while processing.
- **AI proofread** — `AiPanel`'s 오타 검증 tab. `POST /documents/{id}/proofread` returns
  **202 + RUNNING**, so the panel **polls `GET /analyses/{id}` until COMPLETED/FAILED**,
  resumes an in-progress run on mount, and shows findings grouped by category. Clicking a
  finding scrolls the viewer to its `section_id` and highlights it.

Still **mock / not wired** (backend endpoints pending): Dashboard (`/`), RAG Search
(`/search`), Embedding Lab (`/embedding-lab`), and the AI panel's 규정검증/비교/추천 tabs.

### Conventions & gotchas

- **Two status fields**: `document_versions.processing_status` is the pipeline state; the list
  badge and detail header read **that** (`current_version.processing_status`), not
  `documents.status` (which defaults to `"DRAFT"` and is a separate lifecycle field).
- **Processing status flow** (`DocStatus`):
  `UPLOADED → PARSING → PARSED → CHUNKING → CHUNKED → EMBEDDING → READY` (or `FAILED`). The
  pipeline currently **settles at `CHUNKED` (75%)**; `EMBEDDING→READY` waits on Phase 9. Poll
  loops stop at `CHUNKED`/`READY`/`FAILED`. `StatusBadge` tolerates unknown status strings.
- **Modals, not native dialogs**: use `Modal` / `ConfirmDialog` / `PromptDialog`
  (`src/components/ui/Modal.tsx`) instead of `alert`/`confirm`/`prompt`.
- **Shared UI** in `src/components/ui/primitives.tsx` (`PageHeader`, `Card`, `Button`,
  `StatusBadge`, `ErrorBanner`, `Tag`). `ErrorBanner` shows a login link only for auth errors.
- **Charts** (`src/components/charts/`) are dependency-free inline SVG, single brand-red hue
  (no categorical palette → no colorblind validation needed). Dashboard uses them (mock data).
- `description` is a real `documents` column (upload accepts it; `DocumentRead` returns it).

### AI feature modules (roadmap)

Each is a distinct frontend surface fed by the Document Core:

1. **오타/맞춤법 검증 (Proofread)** — *wired* (async 202 + polling). category = spelling/spacing/grammar/expression.
2. **RAG Chat** — question → embedding → pgvector + full-text hybrid search → GPT → answer + citations. *(⏳)*
3. **문서 자동 분류 (Classification)** — type/category/tags. *(⏳)*
4. **관련 문서 추천 (Related)** — vector search over embeddings. *(⏳)*
5. **Document Diff** — version compare → GPT explanation. *(⏳)*
6. **규정 검증 (Regulation validation)** — validate against `RULE` documents via retrieval + GPT. *(⏳)*

### Backend & platform context

- **LLM**: OpenAI GPT (with a rule-based `MockLLMProvider` fallback — proofread works now on
  mock; adding `OPENAI_API_KEY` to the backend switches it to GPT).
- **Embedding**: a **local** model (BGE-M3 / KURE-v1 / Qwen3), benchmarked on real docs;
  active model stored server-side.
- **DB**: PostgreSQL + pgvector (`vector(1024)`). **Storage**: local files + Docker volume.

These live in the backend repo; the frontend only talks to its REST API. When adding a
feature, mirror the backend's schema types into the relevant `src/lib/*.ts` client. See
`docs/api-spec.md` for the endpoint contract and frontend wiring status.
