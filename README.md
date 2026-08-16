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
  app/                 # routes (dashboard, projects, documents, search, embedding-lab, login, auth/callback)
  components/
    layout/            # Sidebar, Topbar, AppChrome (shell + client auth guard)
    auth/              # AuthProvider (session bootstrap)
    ui/                # primitives, Modal (Confirm/Prompt dialogs)
    project/           # ProjectsView, ProjectDocuments, FolderTree, UploadDialog
    document/          # DocumentDetail, AiPanel
    charts/            # inline-SVG charts (single brand-red hue)
  lib/                 # typed API clients (api, auth, projects, documents, versions, ai, …)
```

## What works today

Behind login (`NEXT_PUBLIC_AUTH_ENABLED=true`): Google OAuth → projects CRUD → folder tree
(create/rename/delete) → document upload (modal + preview + description) → processing-status
polling → document detail (outline / viewer / metadata / download) → **AI proofread** (async,
polled, click-to-jump findings) → **Dashboard** (stats / weekly trend / type breakdown /
pipeline counts / recent documents / activity feed).

Still mock (backend pending): RAG Search, Embedding Lab, and the AI panel's
regulation-check / compare / related tabs.

See [`CLAUDE.md`](CLAUDE.md) for architecture and conventions, and
[`docs/api-spec.md`](docs/api-spec.md) for the API contract + wiring status.
