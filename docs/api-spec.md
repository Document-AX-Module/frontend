# API 계약 + 프론트 배선 현황

> **Source of truth**: 백엔드(`sidepjt/backend`)의 `api-spec.md`와 `/openapi.json` (+ `/docs`).
> 이 문서는 **프론트가 실제로 소비하는 것과 배선 여부**를 정리한다. 타입은 `src/lib/types.ts`가
> 백엔드 Pydantic 스키마를 snake_case로 미러링한다.

- Base: `NEXT_PUBLIC_API_BASE_URL` (기본 `http://localhost:8000`) + `/api/v1`
- 인증: `Authorization: Bearer <access>` + refresh는 백엔드 오리진 httpOnly 쿠키
- 에러: `{ "detail": string }` · 목록 페이지네이션 `?page=&limit=`
- 배선: ✅ 프론트 연동 완료 · 🔶 백엔드 ✅ but 프론트 미배선 · ⏳ 백엔드 미구현
- 화면 쪽 동작은 [features/](features/), 미구현 항목의 배경은 [roadmap.md](roadmap.md)

## 1. 인증 — `src/lib/auth.ts`, `AuthProvider`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/auth/providers` → `{ providers: string[] }` | ✅ `/login` |
| GET | `/auth/login/{provider}` (백엔드가 IdP로 리다이렉트) | ✅ `loginWith` |
| GET | `/auth/callback/{provider}` (refresh 쿠키 설정 → `/auth/callback`로 리다이렉트) | ✅ (route handler) |
| POST | `/auth/token/refresh` → `{ access_token, expires_in }` | ✅ 부트스트랩 + 401 자동재발급 |
| POST | `/auth/logout` (204) | ✅ Topbar · 마이페이지 |
| GET | `/auth/me` → `{ id, email, name, role }` | ✅ (initials는 프론트 파생) |
| PATCH | `/auth/me` (프로필 수정) | ⏳ 프론트 미배선 — 마이페이지는 읽기 전용 |

플로우 상세는 [auth.md](auth.md).

## 2. 프로젝트 / 폴더 — `src/lib/projects.ts`

| Method | Endpoint | 배선 |
|---|---|---|
| GET/POST | `/projects` | ✅ 목록/생성 (`ProjectsView`) — 목록은 접근 가능한(public 전체 + 내 invite + 내 private) 프로젝트만 |
| GET/PATCH/DELETE | `/projects/{id}` | ✅ 상세/삭제 (이름/설명 PATCH 미사용, DELETE는 owner 전용) |
| PATCH | `/projects/{id}/visibility` (`{visibility}`, owner 전용) | ✅ `ProjectMembersDialog` 공개 범위 전환 |
| GET/POST | `/projects/{id}/members` (초대는 `{user_id}` 또는 `{email}`, owner 전용) | ✅ `ProjectMembersDialog` 목록/초대 |
| DELETE | `/projects/{id}/members/{user_id}` (owner 전용) | ✅ `ProjectMembersDialog` — 제거 **겸** 초대 취소 |
| GET | `/projects/invitations` → `ProjectInvitationRead[]` | ✅ `ProjectInvitations` (`/projects` 상단 "받은 초대") |
| POST | `/projects/{id}/invitation/accept` → `ProjectRead` | ✅ 수락 |
| POST | `/projects/{id}/invitation/decline` (204) | ✅ 거절 |
| GET | `/users/search?q=&limit=&exclude_project_id=` → `UserSearchResult[]` | ✅ `ProjectMembersDialog` 초대 검색 (`src/lib/users.ts`) |
| GET/POST | `/projects/{id}/folders` | ✅ 트리/생성 (`FolderTree`) |
| PATCH/DELETE | `/folders/{id}` | ✅ 이름변경(인라인)/삭제 |
| PATCH | `/folders/{id}/reorder` (`{parent_id?, target_index}` → 영향받은 형제 `FolderRead[]`) | ✅ 사이드바 드래그앤드롭 (`reorderFolder()`) |

- `ProjectRead` = `{id, name, description, created_by, owner_id, visibility, created_at, updated_at}`.
  `visibility`는 `public`(전체 공개, 기본값) / `invite`(수락한 멤버만) / `private`(owner만) — 생성
  폼에서 라디오로 고르고, 배지는 `visibilityLabel()`/`VisibilityBadge`(`primitives.tsx`)로 그린다.
  문서 수·READY 수 같은 집계는 백엔드 미제공이라 목록 카드에서 계속 생략한다.
- `ProjectMemberRead` = `{user_id, email, name, role(owner|member), status(pending|active|rejected),
  invited_by, created_at, responded_at}`. 라벨/배지는
  `memberStatusLabel()`/`MemberStatusBadge`(`primitives.tsx`)가 유일한 출처다.
- **초대는 즉시 멤버가 되지 않는다.** `POST .../members`는 **201 + `status: "pending"`** 인 초대장을
  만들고, 상대가 `/invitation/accept`를 호출해야 접근 권한이 생긴다. 그래서 UI 문구는 "초대함"이
  아니라 **"수락 대기중"** 이다. `GET .../members`는 `active`뿐 아니라 `pending`/`rejected`도 함께
  돌려주므로 프론트가 `status`로 뱃지 3종을 그린다.
- `DELETE .../members/{user_id}` 하나가 **멤버 제거와 초대 취소를 겸한다** — 응답(204)만으로는
  구분할 수 없으므로 버튼 문구를 호출부가 `status`로 분기한다(`pending`→"초대 취소",
  `active`→"멤버 제거", `rejected`→"목록에서 지우기"). 어느 쪽이든 행을 지우므로 **재초대가 가능**하고,
  거절했던 사용자를 다시 초대하면 같은 행이 `pending`으로 되돌아간다.
- `POST .../members`의 body는 `{user_id}` **또는** `{email}` 정확히 하나다 — 둘 다 보내면 422.
  프론트는 검색 결과에서 고른 `user_id`만 보낸다.
- `GET /users/search`는 **최소 2자**(1자면 422), 이름/이메일 부분일치, 비활성 사용자 제외,
  응답은 `{id, email, name}`뿐이다. `exclude_project_id`를 넘기면 그 프로젝트의 기존 멤버·초대
  대기자가 결과에서 빠진다(그 필터는 해당 프로젝트를 볼 수 있는 사람만 쓸 수 있어 404/403 가능).
  프론트는 300ms 디바운스로 호출한다.
- ⚠️ **미가입자는 초대할 수 없다** — 이메일 초대장 발송 기능이 없어서 검색에 없는 이메일로
  초대하면 **400**이다. 그래서 초대 UI는 "가입된 사용자만 초대할 수 있습니다"를 명시한다.
- `ProjectInvitationRead` = `{project_id, project_name, project_description, visibility, invited_by,
  invited_by_name, invited_by_email, invited_at}`. 수락 전에는 `GET /projects`에 안 나오고
  `GET /projects/{id}`가 **403**이므로 초대 카드는 **이 응답의 필드만으로** 그려야 한다.
- ⚠️ **라우트 순서 주의**: `/projects/invitations`가 `/projects/{project_id}` 보다 먼저 등록돼야
  한다(안 그러면 `invitations`를 int로 파싱하려다 422). §5의 `/documents/recent`와 같은 함정.

## 3. 문서 / 버전 — `src/lib/documents.ts`, `versions.ts`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/projects/{id}/documents?folder_id=&status=&type=` (+author,+current_version) | ✅ `ProjectDocuments` |
| POST | `/projects/{id}/documents` (multipart: file,name,folder_id,description) → **202** | ✅ `UploadDialog` + 상태 폴링 |
| GET/DELETE | `/documents/{id}` | ✅ 상세/삭제 |
| GET | `/documents/{id}/download` | ✅ (Bearer로 blob 저장 · 원본 미리보기도 같은 blob) |
| GET | `/documents/{id}/versions` | ✅ |
| GET | `/versions/{id}` · `/versions/{id}/status` | ✅ 폴링 |
| GET | `/versions/{id}/sections` | ✅ 개요/뷰어 |
| GET | `/versions/{id}/chunks` | 🔶 |
| GET | `/documents/{id}/diff?from_version_id=&to_version_id=` | ✅ `AiPanel` 문서 비교 탭 (`DiffModal`) |
| GET | `/documents/search?q=&limit=` | ✅ `Topbar` 전역 검색 (`documents.ts`의 `searchDocuments`) |
| PATCH | `/documents/{id}/move` (`{project_id?, folder_id?}`) | ✅ `moveDocument()` — `MoveDocumentDialog`(다른 프로젝트) + `FolderTree` 드래그앤드롭(같은 프로젝트 폴더) |
| PATCH | `/documents/{id}` (RULE 지정 등) | ⏳ |

- **상태**: `UPLOADED·PARSING·PARSED·CHUNKING·CHUNKED·EMBEDDING·READY·FAILED`. 배지는
  `current_version.processing_status` 사용. `documents.status`는 삭제됐다(마이그레이션 `72b852f975d6`) —
  버전이 없으면 `UPLOADED`로 본다. 현재 파이프라인은 `CHUNKED`에서 종착.
- 오타 검증 **수정본 적용(§4)이 새 버전을 만든다** — 적용 후에는 `current_version`이 바뀌고
  섹션도 재파싱되므로 `section_id`가 달라진다.
- `/documents/search`는 `/documents/recent`와 응답 shape(`RecentDocumentRead`)이 같지만 최신순이
  아니라 이름/설명 키워드 매칭 기준이고, 접근 가능한 프로젝트로 결과가 필터링된다. `q`가 비어
  있으면 프론트에서 아예 호출하지 않는다(백엔드도 `min_length=1`을 요구).

## 4. AI — `src/lib/ai.ts`, `AiPanel`

| Method | Endpoint | 배선 |
|---|---|---|
| POST | `/documents/{id}/proofread` → **202 + RUNNING** | ✅ 폴링(`getAnalysis`) 후 결과 표시 |
| GET | `/documents/{id}/analyses?type=` | ✅ 최신 이력 로드 · 실행 중이면 폴링 재개 |
| GET | `/documents/{id}/analyses/{analysis_id}` → findings | ✅ 폴링 대상 |
| PATCH | `/documents/{id}/analyses/{analysis_id}/findings/{finding_id}` (`{status}`) → 분석 전체 | ✅ 승인/반려/보류 |
| POST | `/documents/{id}/analyses/{analysis_id}/apply` → `ApplyAnalysisResult` | ✅ 분석 1건당 1회 (재호출 **409**) |
| POST | `/documents/{id}/classify` · `/validate` · `/related` | ⏳ |

- proofread finding = `{id, original, suggestion, reason, category(spelling/spacing/grammar/expression), status(pending/accepted/rejected), section_id?, page_start/end?}`.
  `id`는 한 분석 안에서만 고정된 위치 기반 값(`f0`, `f1`…). finding 클릭 → 뷰어 `#sec-{section_id}` 스크롤+하이라이트.
- 파싱이 끝나기 전(`UPLOADED`/`PARSING`)에 proofread를 호출하면 **409** → 실행 버튼을 막는다.
- `ApplyAnalysisResult` = `{analysis_id, document_id, new_version_id, new_version_no, applied_count, skipped_count, skipped_reasons}`.
  적용 여부의 진짜 출처는 분석의 `applied_version_id`/`applied_at`이다.
- PDF는 완전 편집이 아니라 **시각적 패치**로 적용되므로 폰트가 미세하게 달라질 수 있다(UI에 안내).
- provider = `mock`(규칙기반) | `openai`(GPT). 백엔드에 `OPENAI_API_KEY` 넣으면 GPT로 전환.

동작 상세는 [features/proofread.md](features/proofread.md).

`/documents/{id}/diff`는 AI가 아니라 `difflib` 기반 동기 계산이라(§3 참고) 이 절의 나머지와
성격이 다르다 — 응답이 202/폴링이 아니라 즉시 200이다. 상세는
[features/document-diff.md](features/document-diff.md).

## 5. 대시보드 — `src/lib/dashboard.ts`, `DashboardView`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/dashboard/summary?project_id=` | ✅ 스탯/차트/파이프라인 |
| GET | `/activity?limit=&project_id=` | ✅ 최근 활동 피드 |
| GET | `/documents/recent?limit=&project_id=` | ✅ "최근 문서" 카드 (`documents.ts`) |

- 대시보드는 이 **3요청을 `Promise.all`로 한 번에** 던진다. `/documents/recent`는 집계가 아니라
  목록이고 `limit`을 독립적으로 주므로 `summary`에 얹지 않고 별도 엔드포인트로 유지한다.
  클라이언트는 `dashboard.ts`가 아니라 **`documents.ts`** 에 둔다(경로 도메인이 documents).
- `RecentDocumentRead`는 **snake_case** 다. `project_name`과 `processing_status`(현재 버전 기준,
  버전 없으면 `UPLOADED`)가 납작하게 펼쳐져 오므로 문서별 추가 조회 없이 프로젝트 경로 +
  `StatusBadge`를 바로 그린다.
- **`summary`/`activity`만 camelCase**(`ragToday`, `weeklyProcessing`, `documentTypes`) — 프론트가
  먼저 확정해 둔 계약에 백엔드가 `alias_generator=to_camel`로 맞춘 것. 6절 `/mypage/summary`까지
  합쳐 **API 전체에서 camelCase는 이 3개뿐**이고 나머지는 snake_case다.
- 백엔드가 의도적으로 클라이언트에 남긴 파생값 3개 — `weeklyProcessing` 축 라벨(**UTC** 기준),
  `pipeline[].status` → 한글 라벨(`statusLabel()`), `at` → 상대 표기. 계산 규칙은
  [features/dashboard.md](features/dashboard.md).
- `pipeline`은 0건 단계도 8개 전부 고정 순서로 내려오므로 `PipelineStrip` 칸 수가 흔들리지 않는다.
  집계 기준은 **현재 버전의 `processing_status`** 다(`documents.status`는 삭제됨).
- **활동 피드는 `activity_logs` 테이블 기반**이다(마이그레이션 `1e199411435d`). DB에는 표시 문구가
  아니라 액션 코드(`document.upload`, `analysis.start` …)가 들어가고, 문구·배지 `kind`(11종)는 읽을
  때 `activity_service.describe()`가 만든다 → **프론트가 열거해야 하는 집합**이다. kind 목록, 배지
  톤, 문서 링크 규칙(`canLinkToDocument`)은 [features/activity-feed.md](features/activity-feed.md).
- `analysis.start`/`complete`/`fail`이 각각 로그로 남아 한 번 실행에 피드 항목이 2건 생긴다(시작+완료).
- 대상이 없는 활동(`로그인`)은 `target`이 빈 문자열로 온다.
- **라우트 순서 주의**: 백엔드가 `/documents/recent`를 `/documents/{document_id}` 보다 먼저 등록해야
  한다(안 그러면 `recent`가 int로 파싱돼 422). 프론트에서 깨질 일은 없지만 백엔드 리팩터링 시 주의.
- ⚠️ **`project_id` 처리가 엔드포인트마다 다르다**: 없는 프로젝트를 주면 `/documents/recent`는
  **404**, `/dashboard/summary`는 **200**(빈 집계)이다. 지금 대시보드는 `project_id`를 안 보내지만,
  프로젝트 스코프 대시보드를 만들면 `Promise.all` 하나가 404로 전체를 실패시킨다.
- **미구현으로 남은 값**: `stats.ragToday`는 항상 0(RAG가 MVP2) → 타일에 `RAG 미구현` 배지를 붙여
  실측값처럼 보이지 않게 했다. `규정/분류/추천` kind는 해당 AI 모듈이 붙어야 실제로 나온다.
- `/activity`의 `action=`(코드 필터), `project_id=` 파라미터는 아직 프론트에서 안 쓴다.
- `stats.processing > 0`인 동안만 15초 간격으로 재조회한다(파이프라인 카드의 "실시간" 표기 근거).

## 6. 마이페이지 — `src/lib/mypage.ts`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/mypage/summary?activity_limit=` | ✅ `/mypage` (프로필+집계+활동 한 번에) |

- 응답 `MyPageSummary` = `{ profile, stats{projects,documents,processing}, recentActivity[] }`.
  **camelCase**(`lastLoginAt`, `memberSince`, `recentActivity`) — 5절과 함께 예외 3개 중 하나.
- 스코핑 기준이 대시보드와 다르다: `project_id`가 아니라 **로그인 사용자**
  (`created_by`/`actor_id`) 기준이다.
- `recentActivity`는 `/activity`와 같은 `ActivityItem` 스키마라 `ActivityFeed`를 그대로 재사용한다.

상세는 [features/mypage.md](features/mypage.md).

## 7. 알림 — `src/lib/notifications.ts`, `NotificationBell`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/notifications?only_unread=&limit=&offset=` → `{items, unread}` | ✅ 벨 드롭다운 |
| GET | `/notifications/unread-count` → `{unread}` | ✅ 뱃지 폴링 |
| POST | `/notifications/{id}/read` → `NotificationRead` | ✅ 항목 클릭 시 (멱등) |
| POST | `/notifications/read-all` → `{unread: 0}` | ✅ "모두 읽음" |

- `NotificationRead` = `{id, type, title, body, url, meta, read_at, created_at}` (**snake_case**).
  `read_at`이 null이면 안 읽음.
- 응답의 `unread`는 `only_unread`/`limit`과 **무관한 전체 미읽음 수**라 `items.length`와 다를 수
  있고, 벨 뱃지에 그대로 쓴다.
- `type`은 백엔드에서 자유 문자열이지만 값 집합이 계약이다(6종):
  `project.invite` · `project.invite_accepted` · `project.invite_declined` ·
  `project.member_removed` · `analysis.complete` · `analysis.fail`. 활동 피드의 `kind`처럼
  **프론트가 열거**하며, 라벨/톤은 `notificationTypeLabel()`/`NotificationTypeBadge`가 유일한 출처다.
- **SSE/WebSocket이 없다** → 벨은 폴링이다: 60초 주기 + `window` focus + 서비스워커 postMessage.
  푸시를 거부한 사용자도 벨로는 알림을 받는다.
- `url`은 **프론트 경로 그대로** 쓸 수 있다(`/projects/{id}`, `/documents/{id}` 모두 기존 라우트와
  일치). null이면 이동 없이 읽음 처리만. **예외 하나**: `project.invite`의 `url`은
  `/projects/{id}`인데 수락 전에는 그 상세가 403이라, 프론트가 `/projects`(초대 카드 위치)로 돌린다.
- 남의 알림 id로 호출하면 403이 아니라 **404**다(존재 자체를 알려주지 않음).

## 8. Web Push — `src/lib/push.ts`, `public/sw.js`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/push/public-key` → `{public_key}` | ✅ 구독 시작 시 |
| POST | `/push/subscribe` (`{endpoint, keys{p256dh, auth}}`, 204) | ✅ 마이페이지 토글 (같은 endpoint면 upsert) |
| DELETE | `/push/subscribe` (`{endpoint}`, 204) | ✅ 토글 끄기 — **body가 있는 DELETE** (`api.delete(path, { body })`) |

- 백엔드에 VAPID 키가 없으면 `public_key`가 **빈 문자열**로 온다 → 그때는 구독을 시작하지 않고
  "서버에 푸시 키가 설정되지 않았습니다"로 끊는다.
- 푸시 payload는 `{title, body, url, type}` **4개 키로 고정**이다(백엔드 `push_service.py`). 이게
  서비스워커와의 계약이다 — `tag: type`으로 같은 종류의 알림을 묶고, `data.url`로 클릭 라우팅한다.
- **서비스워커는 토큰을 다루지 않는다.** 구독 등록/해제는 메인 스레드(`push.ts`)에서 Bearer로 한다.

동작·제약(Turbopack, secure context)은 [features/notifications.md](features/notifications.md).

## 9. 아직 라우터 없음 (⏳)

- RAG `/rag/*` — `rag.ts` 준비됨, 화면은 목업
- Embedding Lab `/embedding/*` — `embedding.ts` 준비됨, 화면은 목업
- 전역 검색 `/search?q=` — 사이드바 RAG 검색 화면이 목업 (Topbar 검색은 `/documents/search`로 배선됨)
- `/health` (✅ 존재, 프론트 미사용)

엔드포인트/스키마가 미확정인 백엔드 로드맵 백로그(퀴즈·PPT·알림·즐겨찾기/메모·MCP)는
[roadmap.md](roadmap.md)로 옮겼다.
