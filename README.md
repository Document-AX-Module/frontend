# AX Document Platform — Frontend

Next.js web frontend for the **AX Document Platform**, a modular AI document-work platform
(project-based document management + GPT/RAG). It talks to the FastAPI backend in the sibling
`sidepjt/backend` repo.

Stack: Next.js (App Router, Turbopack) · TypeScript · Tailwind CSS v4.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then edit if needed
npm run dev                        # http://localhost:3000
```

Requires the backend running (default `http://localhost:8000`) with CORS allowing
`http://localhost:3000` and `allow_credentials=True`.

### Environment (`.env.local`)

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend origin; the client appends `/api/v1`. |
| `NEXT_PUBLIC_AUTH_ENABLED` | `false` | `true` → redirect unauthenticated users to `/login` (needs the backend for the Google/mock OAuth flow). Keep `false` to view the UI without auth. |

## Commands

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm run start    # run the production build
npm run lint     # eslint
```

## Structure

```
src/
  app/                 # routes (dashboard, projects, documents, mypage, search, embedding-lab, login, auth/callback)
  components/
    layout/            # Sidebar, Topbar, AppChrome (shell + client auth guard)
    auth/              # AuthProvider (session bootstrap)
    ui/                # primitives, Modal (Confirm/Prompt dialogs), IconTile, IconMenu, icons/
    project/           # ProjectsView, ProjectDocuments, FolderTree, UploadDialog, DocumentInfoDialog
    document/          # DocumentDetail, AiPanel
    dashboard/         # DashboardView
    activity/          # ActivityFeed (shared by dashboard + mypage)
    charts/            # inline-SVG charts (single brand-red hue)
  lib/                 # typed API clients (api, auth, projects, documents, versions, ai, dashboard, mypage, …)
```

## What works today

Behind login (`NEXT_PUBLIC_AUTH_ENABLED=true`): Google OAuth → projects CRUD → folder tree
(create/rename/delete) → document upload (modal + preview + description) → processing-status
polling → document detail (outline / viewer / metadata / download) → **AI proofread** (async,
polled, click-to-jump findings, accept/reject, apply corrections into a new version) →
**Dashboard** (stats / weekly trend / type breakdown / pipeline counts / recent documents /
activity feed) → **My page** (profile, own counts, own activity).

Still mock (backend pending): RAG Search, Embedding Lab, global search, notifications, and the
AI panel's regulation-check / compare / related tabs.

## Docs

[`CLAUDE.md`](CLAUDE.md) is the entry point (project overview + hard rules + a map of the docs
below). The details live in [`docs/`](docs/), in Korean:

| Doc | Covers |
|---|---|
| [architecture.md](docs/architecture.md) | app shell, routing, `src/lib` API clients, status/pipeline rules |
| [auth.md](docs/auth.md) | OAuth flow, token refresh, client-side route protection |
| [ui-guidelines.md](docs/ui-guidelines.md) | design tokens, shared components, colour policy |
| [api-spec.md](docs/api-spec.md) | endpoint contract + wiring status |
| [features/](docs/features/) | per-surface docs: projects & documents, proofread, dashboard, activity feed, my page |
| [roadmap.md](docs/roadmap.md) | what's still mock, AI module roadmap, backend/platform context |
