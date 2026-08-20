# 아키텍처

앱 셸 · 라우팅 · API 클라이언트 레이어 · 문서 상태 규약. 화면별 동작은
[features/](features/), 시각 규칙은 [ui-guidelines.md](ui-guidelines.md), 엔드포인트 계약은
[api-spec.md](api-spec.md)를 본다.

## 스택

- Next.js App Router (`src/app`), TypeScript, Tailwind CSS v4, import alias `@/*` → `src/*`.
- `next.config.ts`에서 `turbopack.root`를 이 디렉터리로 고정한다 — 안 하면 Turbopack이 상위
  디렉터리의 엉뚱한 lockfile을 잡는다.
- **Next.js 버전이 학습 데이터와 다를 수 있다.** 코드를 쓰기 전에
  `node_modules/next/dist/docs/`의 해당 가이드를 확인한다 (`AGENTS.md` 참조).

## 앱 셸

`src/app/layout.tsx` → `AuthProvider` → `AppChrome` (`src/components/layout/`).

- `AppChrome`이 `Sidebar` + `Topbar` 셸을 그린다. 단, **bare 라우트**(`/login`, `/auth/*`)에서는
  셸 없이 children만 렌더한다.
- `Sidebar` 내비: `/`(대시보드) · `/projects` · `/search`(RAG 검색) · `/embedding-lab`.
  **마이페이지는 사이드바가 아니라 `Topbar` 계정 메뉴**에서 들어간다.
- `Topbar`의 검색 입력과 알림 벨은 아직 **비배선 스텁**이다(백엔드 `/search`, `/notifications`
  미구현 → [roadmap.md](roadmap.md)).
- 폰트는 `layout.tsx`에서 주입한다: 한글 UI는 로컬 가변 폰트 **Pretendard**(`--font-pretendard`),
  숫자/영문 등폭은 `Geist Mono`(`--font-geist-mono`). Geist Sans는 라틴 전용이라 한글이 시스템
  고딕으로 폴백돼 톤이 어긋나서 걷어냈다.

## 라우트

| 라우트 | 컴포넌트 | 상태 |
|---|---|---|
| `/` | `dashboard/DashboardView` | ✅ 배선 ([dashboard](features/dashboard.md)) |
| `/projects` | `project/ProjectsView` | ✅ 배선 |
| `/projects/[projectId]` | `project/ProjectDocuments` | ✅ 배선 ([projects-documents](features/projects-documents.md)) |
| `/documents/[docId]` | `document/DocumentDetail` + `AiPanel` | ✅ 배선 ([proofread](features/proofread.md)) |
| `/mypage` | `app/mypage/page.tsx` | ✅ 배선 ([mypage](features/mypage.md)) |
| `/login` | `app/login/page.tsx` | ✅ 배선 ([auth](auth.md)) |
| `/auth/callback` | route handler → `/`로 바운스 | ✅ 배선 |
| `/search` | 목업 | ⏳ |
| `/embedding-lab` | 목업 | ⏳ |

## API 클라이언트 레이어 (`src/lib/`)

백엔드 도메인 하나당 타입 모듈 하나. **타입은 백엔드 Pydantic 스키마를 `snake_case`로
미러링한다**(예: `folder_id`, `processing_status`) — 공유 타입 패키지가 없으니 **수동으로 맞춘다**.
최종 권위는 백엔드의 `/openapi.json`(+ `/docs`)이다.

- `api.ts` — fetch 래퍼. `NEXT_PUBLIC_API_BASE_URL` + `/api/v1`을 붙이고,
  `Authorization: Bearer <access>`를 주입하고, 쿠키를 보내고, **401이면 refresh를 한 번 하고
  재시도**한다. `ApiError`, `isAuthError`(401/403만), `errorMessage`,
  `getAccessToken`/`setAccessToken`를 내보낸다.
- `types.ts` — 공용 타입 (`Project`, `Folder`, `Document`, `DocumentVersion`, `Section`,
  `DocStatus`, `ProofreadResult`, `ActivityItem`, `MyPageSummary` …).
- 도메인 클라이언트: `auth.ts`, `projects.ts`, `documents.ts`, `versions.ts`, `ai.ts`,
  `dashboard.ts`, `mypage.ts`, `rag.ts`(목업 화면용, 준비만 됨), `embedding.ts`(동일).
- `format.ts` — API가 아닌 순수 표시 유틸(`formatFileSize`).

### 클라이언트 배치 규칙

**경로 도메인을 따른다.** `GET /documents/recent`는 대시보드에서만 쓰지만 `dashboard.ts`가 아니라
`documents.ts`에 둔다(`listRecentDocuments`).

### camelCase 예외

API는 전부 `snake_case`인데 **세 응답만 camelCase**다:

- `GET /dashboard/summary` (`ragToday`, `weeklyProcessing`, `documentTypes`)
- `GET /activity` (`targetType`, `targetAlive` …)
- `GET /mypage/summary` (`lastLoginAt`, `memberSince`, `recentActivity`)

프론트가 먼저 확정해 둔 계약에 백엔드가 `alias_generator=to_camel`로 맞춘 것이다. 나머지는
`RecentDocumentRead`까지 포함해 모두 snake_case다.

## 문서 상태 규약

- **상태는 문서가 아니라 버전에 있다.** `documents.status`는 삭제됐고(마이그레이션
  `72b852f975d6`) `DocumentRead`도 더 이상 안 내려준다 → **`current_version.processing_status`**
  를 읽고, 버전이 아직 없으면 `"UPLOADED"`로 본다(백엔드 `RecentDocumentRead`와 같은 규칙).
- **처리 상태 흐름**(`DocStatus`):
  `UPLOADED → PARSING → PARSED → CHUNKING → CHUNKED → EMBEDDING → READY` (또는 `FAILED`).
- 파이프라인은 현재 **`CHUNKED`(75%)에서 종착**한다 — `EMBEDDING→READY`는 백엔드 Phase 9 대기.
  그래서 폴링 루프의 종료 조건은 `CHUNKED`/`READY`/`FAILED` 세 개다
  (`DocumentDetail`의 `POLL_STOP`).
- `StatusBadge`는 모르는 상태 문자열도 깨지지 않게 처리한다.
- 한글 상태 라벨의 유일한 출처는 `primitives.tsx`의 `STATUS_STYLES`다 — `statusLabel()`로 읽고
  맵을 다시 선언하지 않는다.

## 환경 변수

| 변수 | 기본값 | 의미 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | 백엔드 오리진. 클라이언트가 `/api/v1`을 붙인다. |
| `NEXT_PUBLIC_AUTH_ENABLED` | `false` | `true`면 미인증 사용자를 `/login`으로 보낸다. 기본 off라서 백엔드 없이도 UI를 볼 수 있다. |
