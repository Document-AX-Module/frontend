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
| POST | `/documents/{id}/versions` (multipart: file) → **202** | ✅ `createVersion()` — 맞춤법 검사기 "새 문서로 저장"이 원본(V1) 위에 수정본을 V2로 인서트할 때만 쓴다 |
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
| POST | `/text/proofread` → 202 + `TextProofreadJob`(`RUNNING`) | ✅ `/proofread` 페이지 — 문서 미등록 텍스트 검사, `text_proofread_jobs` 테이블에 영속화 |
| GET | `/text/proofread` → `TextProofreadJobSummary[]`(`id, status, created_at`) | ✅ 내 최근 job 목록 — `listAnalyses`와 같은 역할, 마운트 시 이어받기용 |
| GET | `/text/proofread/{job_id}` → `TextProofreadJob` | ✅ 폴링 대상. 남의 job이면 404 |

- proofread finding = `{id, original, suggestion, reason, category(spelling/spacing/grammar/expression), status(pending/accepted/rejected), section_id?, page_start/end?}`.
  `id`는 한 분석 안에서만 고정된 위치 기반 값(`f0`, `f1`…). finding 클릭 → 뷰어 `#sec-{section_id}` 스크롤+하이라이트.
- 파싱이 끝나기 전(`UPLOADED`/`PARSING`)에 proofread를 호출하면 **409** → 실행 버튼을 막는다.
- `ApplyAnalysisResult` = `{analysis_id, document_id, new_version_id, new_version_no, applied_count, skipped_count, skipped_reasons}`.
  적용 여부의 진짜 출처는 분석의 `applied_version_id`/`applied_at`이다.
- PDF는 완전 편집이 아니라 **시각적 패치**로 적용되므로 폰트가 미세하게 달라질 수 있다(UI에 안내).
- provider = `mock`(규칙기반) | `openai`(GPT). 백엔드에 `OPENAI_API_KEY` 넣으면 GPT로 전환.
- `/text/proofread` finding = `{id, original, suggestion, reason, category}` — `section_id`/
  `page_start/end`/`status`가 없다(문서·분석에 안 묶임). 승인/반려 상태는 서버에 저장되지 않고
  프론트가 로컬로만 들고 있다가, 승인된 것만 문자열 치환으로 에디터에 반영한다.
- `TextProofreadJob.id`는 **number**(DB PK) — 다른 analysis 엔드포인트의 `id`와 같은 패턴.
  `text_proofread_jobs` 테이블은 `user_id/status/provider/result(JSONB)/error`만 저장한다 —
  **원본 입력 텍스트는 서버에 없다**. 그래서 프론트는 검사 시작 시점의 마크다운을
  `localStorage`(`proofread:draft-markdown`)에도 남겨서, 알림을 타고 돌아왔을 때 결과뿐 아니라
  원래 쓰던 텍스트도 같이 복원한다.
- 완료/실패 시 `notify()`가 인앱 알림 + 웹푸시를 함께 보낸다. 타입은 `text_proofread.complete`/
  `text_proofread.fail`, `url`은 고정으로 `/proofread`, `meta.job_id`로 어떤 job인지 식별한다.

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
- `type`은 백엔드에서 자유 문자열이지만 값 집합이 계약이다(10종):
  `project.invite` · `project.invite_accepted` · `project.invite_declined` ·
  `project.member_removed` · `analysis.complete` · `analysis.fail` ·
  `text_proofread.complete` · `text_proofread.fail` · `quiz_generate.complete` ·
  `quiz_generate.fail` · `quiz.assigned` · `quiz.due_soon`. 활동 피드의 `kind`처럼
  **프론트가 열거**하며, 라벨은 `notificationTypeLabel()`/`NotificationTypeBadge`가 유일한 출처다.
  뱃지는 타입 간 톤 구분 없이 무채색 하나로 통일한다.
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

## 9. Embedding Lab — `src/lib/embedding.ts`, `/embedding-lab` (전부 admin 전용, 403 게이팅)

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/embedding/models` → `EmbeddingModelRead[]` | ✅ `ModelsPanel` 목록 |
| POST | `/embedding/models/{id}/activate` | ✅ `ModelsPanel` 활성화 (청킹 설정은 불변) |
| POST | `/embedding/models/{id}/reembed` → `EmbeddingJobRead` (202) | ✅ `ModelsPanel` + `JobProgress` 폴링 |
| GET/POST | `/embedding/datasets` | ✅ `BenchmarkPanel` 목록 · `DatasetModal` 생성(질문 + ground truth) |
| GET | `/embedding/benchmarks` → `BenchmarkRunRead[]` (결과 포함) | ✅ `BenchmarkPanel` 실행 이력 |
| POST | `/embedding/benchmarks/run` → `{run_id}` (202, `chunking_config` override 가능) | ✅ `BenchmarkPanel` 실행 |
| GET | `/embedding/benchmarks/{run_id}` | ✅ 진행 중인 run 폴링 |
| POST | `/embedding/benchmarks/{run_id}/apply` (`{model_id}`) | ✅ `BenchmarkPanel` "운영 적용" — 기존 문서 재처리는 트리거하지 않음 |
| POST | `/embedding/migrate` → `EmbeddingJobRead` (202) | ✅ `MigrationPanel` — 문서 체크박스로 골라 재청킹+재임베딩 |
| GET | `/embedding/jobs/{job_id}` | ✅ `JobProgress` — reembed/migrate 공용 폴링 |

- 사이드바 "관리자" 섹션과 `/embedding-lab` 페이지는 `useAuth().user.role === "admin"`이 아니면 숨김/차단.
- job/run/result의 status 어휘는 `RUNNING` / `COMPLETED` / `FAILED`로 공통 — `EmbeddingJobStatusBadge` 하나로 셋 다 표시.
- 상세는 [features/embedding-lab.md](features/embedding-lab.md).

## 10. 퀴즈 (`quiz.ts`)

백엔드 `app/api/v1/quiz.py` · `app/schemas/quiz.py`. 20개 전부 배선 완료.
문제은행/문제집/내 응시 이력은 **프로젝트 스코프**여서, `/quiz/*` 라우트는
`QuizProjectProvider`가 들고 있는 "지금 보고 있는 프로젝트"를 붙여 호출한다.

| Method | Path | 상태 |
|---|---|---|
| GET | `/projects/{project_id}/quiz-questions` (`?document_id=&difficulty=&type=&review_status=&q=`) | ✅ `QuestionBankView` — 필터는 전부 서버 쿼리 파라미터. `QuizQuestionRead`는 `source_document_title`(문서명, 결과 화면 그룹핑용)도 내려준다 |
| POST | `/projects/{project_id}/quiz-questions` (201) | ✅ `QuestionFormModal` — 서버가 `generation_type=MANUAL`/`review_status=DRAFT` 고정 |
| PATCH | `/quiz-questions/{question_id}` | ✅ 부분 수정. **문제집 잠금과 무관** (409 없음) |
| DELETE | `/quiz-questions/{question_id}` (204) | ✅ 문제은행에서 완전 삭제 — 담고 있던 문제집에서도 빠지지만 과거 응시 결과는 스냅샷이라 유지 |
| GET | `/projects/{project_id}/quizzes` | ✅ `QuizBooksView` — **문항 수는 응답에 없어** 문제집별로 `/questions`를 따로 센다. `QuizBookRead`는 `created_by_user_id`/`can_manage`(생성자·프로젝트 소유자·admin만 true)와 `due_at`/`assignees`(아래 참고)도 내려준다 |
| POST | `/projects/{project_id}/quizzes` (`due_at`, `assignee_user_ids` 포함, 201) | ✅ 문제집 생성 폼 — `assignee_user_ids`를 보내면 생성 즉시 `quiz.assigned` 알림 발송. 프로젝트 활성 멤버가 아니면 400 |
| GET | `/quizzes/{quiz_book_id}` | ✅ `QuizBookDetail` |
| PATCH | `/quizzes/{quiz_book_id}` (`due_at`, `assignee_user_ids` 포함) | ✅ 설정 탭 — 🔒 409(응시 이력) · 🚫 403(`can_manage=false`) · `assignee_user_ids`를 보내면 지정자 **전체가 교체**되고 새로 추가된 사람에게만 `quiz.assigned` 재발송(기존 지정자는 재발송 안 함), 활성 멤버가 아니면 400 |
| DELETE | `/quizzes/{quiz_book_id}` (204) | ✅ 잠금과 무관하게 항상 허용, 세션/답변 cascade 삭제 — 🚫 403(`can_manage=false`) |
| POST | `/quizzes/{quiz_book_id}/duplicate` (201) | ✅ 잠긴 문제집 편집 경로 — 복제 후 새 문제집으로 이동. `can_manage`와 무관하게 프로젝트 멤버 전체 허용 |
| GET | `/quizzes/{quiz_book_id}/questions` | ✅ 순서대로, 정답 포함 (편집 화면용) |
| POST | `/quizzes/{quiz_book_id}/questions` (`{question_ids}`) | ✅ 문제은행에서 편입 — 🔒 409 · 🚫 403(`can_manage=false`) |
| DELETE | `/quizzes/{quiz_book_id}/questions/{question_id}` (204) | ✅ 연결만 해제 — 🔒 409 · 🚫 403(`can_manage=false`) |
| POST | `/quizzes/{quiz_book_id}/sessions` (`{mode}`, 201) | ✅ 정답 빠진 문항 + `session_id`. 모드는 시작 시 서버에 고정. `resumed`(재개 여부) · `answers`(재개 시 study 모드 기존 답변) · `draft_answers`(재개 시 exam 모드 임시저장 답변)도 내려준다 |
| PATCH | `.../sessions/{session_id}/draft` (`{question_id, user_answer}`) | ✅ exam 모드 임시저장 — 답 고를 때마다 디바운스 호출, `{ draft_answers }` 반환 |
| POST | `.../sessions/{session_id}/answers` | ✅ study 모드 즉시채점 (문항 1개씩). `ESSAY`는 `score`/`feedback`도 채워진다 |
| POST | `.../sessions/{session_id}/submit` | ✅ 최종 제출 → 점수 집계 + 오답노트 |
| GET | `/quizzes/{quiz_book_id}/sessions` (`?status=IN_PROGRESS\|SUBMITTED`) | ✅ 문제집 결과 탭 — `can_manage=true`면 **전체 응시자**(`user_name`/`user_email` 포함), 아니면 **본인 세션만** |
| GET | `.../sessions/{session_id}` | ✅ 세션 상세(오답노트) — 본인 세션이거나 `can_manage=true`. 관리자가 남의 세션을 볼 때는 `reveal_answers`와 무관하게 정답/해설이 항상 내려온다. `QuizAnswerRecord`는 `score`/`feedback`도 내려준다(`ESSAY`만, `reveal_answers=false`면 null) |
| GET | `/projects/{project_id}/quiz-sessions` (`?status=IN_PROGRESS\|SUBMITTED`) | ✅ 결과·오답 화면 — 프로젝트 통틀어 **내** 이력 |
| POST | `/projects/{project_id}/quiz-questions/generate` → `QuizGenerationJobRead` (202) | ✅ `GenerateQuestionsModal` — AI 문제 생성 시작. `types`에 `ESSAY` 지정 가능. `quiz_book_id`를 지정했는데 그 문제집을 `can_manage`할 수 없으면 403 |
| GET | `/quiz-generation-jobs/{job_id}` | ✅ `GenerateQuestionsModal` 폴링 |

AI 문제 생성은 **검색이 아니라 커버리지 방식**이다 — 질의(topic)를 받지 않고, 지정한 문서의
청크를 등장 순서대로 전부 훑어 배치로 나눠 출제한다. 그래서 임베딩이 없는 문서(`CHUNKED`
상태)에서도 동작한다. 생성된 문항은 `generation_type=AI`/`review_status=DRAFT`로 문제은행에
들어가고, `quiz_book_id`를 지정하면 그 문제집에도 자동 편입된다. `GenerateQuestionsModal`은
문제은행(`QuestionBankView`)과 문제집 상세(`QuizBookDetail`) 양쪽에서 열리며, 후자는 프로젝트·
편입 문제집이 그 문제집으로 고정된다. 202로 `status=RUNNING`인 작업을 받고 2초 간격으로
`/quiz-generation-jobs/{job_id}`를 폴링한다 — `created_count`는 배치마다 올라가 진행률로 쓴다.
`COMPLETED`인데 `error`가 있으면 "부분 성공"(중복 제외/일부 배치 실패로 요청보다 적게 생성됨)
안내다. 409는 두 가지 다른 의미(대상 문서에 청크 없음 / 편입 문제집 응시 이력 있음)를 가져
`isQuizLockedError`로 뭉뚱그리지 않고 서버 메시지를 그대로 보여준다.

프론트가 반드시 지켜야 하는 네 가지:

1. **`has_sessions`로 버튼을 미리 잠근다.** 서버(409)가 최종 방어선이지만 클릭 후 에러는 UX가
   나쁘다. 조회 시점과 수정 시점 사이에 상태가 바뀔 수 있으니 409도 항상 처리한다 —
   `isQuizLockedError` / `QUIZ_LOCKED_MESSAGE`.
2. **`can_manage`로도 버튼을 미리 잠근다 — `has_sessions`와 독립된 조건이다.** 생성자·프로젝트
   소유자·admin이 아니면 수정/삭제/문항 편입·제외/자동 생성-편입이 403. 새 헬퍼는 필요 없다 —
   `ApiError.message`가 서버 메시지를 그대로 담고 있어 기존 `errorMessage(e, fallback)`가 이미
   보여준다. 복제(`duplicate`)만은 `can_manage`와 무관하게 항상 허용된다.
3. **`shuffle_options`는 백엔드가 섞지 않는다.** 정답이 `options` 인덱스라서다. 프론트가 표시
   순서만 섞고 제출은 항상 서버가 준 배열의 **원본 인덱스**로 한다 (`QuizTake`의 `displayOrder`).
4. **제출 시 모든 문항을 보낸다.** 서버는 실제로 기록된 답변 수로 `total_count`를 계산하므로,
   답하지 않은 문항을 빼고 보내면 분모에서 빠져 점수가 부풀려진다 — 무응답도 `""`로 보낸다.

**응시자 지정(`assignee_user_ids`)과 마감기한(`due_at`)은 `has_sessions` 잠금에 걸리는 일반 설정
필드다** — 생성/`PATCH` 둘 다 다른 필드와 같은 자리에서 받고, 잠긴 문제집은 이것도 못 고친다.
지정자는 **그 프로젝트의 활성(active) 멤버**여야 하며(아니면 400), `assignee_user_ids`는 항상
**전체 교체**라 일부만 추가/삭제하는 API는 없다 — 프론트는 현재 지정자를 미리 체크해 둔 멤버
목록에서 다시 전체를 보낸다. 마감이 `quiz_due_reminder_window_hours`(백엔드 설정, 기본 24시간)
이내로 남으면 아직 제출하지 않은 지정자에게 `quiz.due_soon` 알림이 서버 백그라운드 스레드로
자동 발송된다 — 프론트가 트리거할 방법은 없다.

`QuizQuestionType`은 `SINGLE_CHOICE` · `TRUE_FALSE` · `SHORT_ANSWER` 외에 `ESSAY`(서술형)가
있다. `ESSAY`는 `options` 없이 `correct_answer`가 모범답안, `explanation`이 채점기준 역할이고,
채점은 문항당 GPT 호출 1회라 지연이 있다.

- 상세는 [features/quiz.md](features/quiz.md).

## 11. RAG — `src/lib/rag.ts`, `/search`

| Method | Endpoint | 배선 |
|---|---|---|
| POST | `/rag/search` — GPT 없이 유사 청크만 반환 | 🔶 클라이언트만 (`search()`), 화면 미사용 |
| POST | `/rag/query` — 검색 + GPT 답변 (동기) | 🔶 클라이언트만 (`query()`), 화면은 스트리밍 사용 |
| POST | `/rag/query/stream` — 검색 + GPT 답변 (SSE) | ✅ `RagSearchView` 채팅 입력 |
| GET | `/rag/history?limit=` | 🔶 클라이언트만 (`history()`), 화면은 대화 목록 사용 |
| GET | `/rag/conversations?limit=` | ✅ 좌측 "대화" 목록 |
| GET | `/rag/conversations/{id}` | ✅ 대화 클릭 시 재진입 |

- 전부 **snake_case**. `RagScope` = `{project_ids?, folder_ids?}` — 둘 다 생략/빈 배열이면 "내가
  접근 가능한 프로젝트 전체". `RagSearchView`는 좌측 체크박스에서 `listProjects()` 결과를 그대로
  스코프 후보로 쓰고, "전체 프로젝트" 체크 시 빈 스코프(`scope` 자체를 생략)로 보낸다.
- `RagCitation.score`는 **하이브리드 RRF 융합 점수라 절대값이 아니다** — 벡터/FTS 각 결과 목록의
  순위만으로 `1/(k+rank)`(k=60)를 합산해 만든 값이라 최댓값도 0.03대에 불과하다. 그대로 %로
  보여주면 최상위 출처도 "3%"처럼 보여 오해를 주므로, UI는 절대 퍼센트 대신 **같은 응답 안
  citations 중 최고점 대비 상대 비율**을 막대로만 보여준다(응답 간 비교는 불가). 인용 순서
  (`index`, 답변 본문의 `[1]` 표기와 대응)는 별도 배지로 보여준다.
- `RagQueryResponse.confidence` / `RagStreamDone.confidence` / `RagMessageRead.confidence`는 위
  `score`와 별개로, GPT가 답변에 스스로 매긴 0~1 자기신고 값이다(provider가 값을 안 주면
  `null`). `RagSearchView`는 이걸 `ConfidenceBadge`로 "출처" 섹션 옆에 퍼센트 + 3단계 라벨로
  보여준다 — 검색 유사도(`score`)와 혼동하지 않게 별도 필드/배지로 유지한다.
- 스트리밍은 `event: meta → delta* → citations → done`(또는 `error`) 순서로 온다. `rag.ts`의
  `queryStream()`이 `fetch` + `ReadableStream`을 직접 파싱한다 — `api.ts`의 `request()`는 JSON
  전체 응답을 기다리는 구조라 스트리밍에 못 쓴다. 검색/권한 오류(403/404/503)는 스트림을 열기
  전에 일반 HTTP 에러로 오고, LLM 자체 실패만 스트림 중 `error` 이벤트로 온다(이 경우 `done` 없음).
- `meta`의 `conversation_id`는 **새 대화의 첫 메시지에서는 null**일 수 있다 — 실제 id는 `done`
  이벤트에서 확정되므로, `RagSearchView`는 `done`을 받을 때까지 활성 대화를 미확정 상태로 둔다.
- `conversation_id`를 보내면 이전 턴을 포함해 이어붙는 멀티턴 대화가 된다. 대화 목록/재진입은
  `/rag/conversations`, 대시보드 등에서 쓸 "최근 질문" 한 줄 요약은 `/rag/history`로 분리돼 있다.
- 상세는 [features/rag-search.md](features/rag-search.md).

## 13. 관리자 AI 운영 대시보드 — `src/lib/admin.ts`, `/ai-ops` (전부 admin 전용, 403 게이팅)

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/admin/usage/summary?period=day\|month\|year`(기본 month) | ✅ `UsagePanel` — 토큰/추정비용 집계(`total`/`by_day`/`by_feature`/`status_counts`) |
| GET | `/admin/usage/logs?feature=&status=&page=&size=` | ✅ `UsageLogsPanel` — LLM 호출 성공/실패 원본 로그, 페이지네이션 |
| GET | `/admin/billing/summary` | ✅ `UsagePanel` — `actual_available`로 실제 청구액 유무가 갈린다(아래 참고) |
| GET | `/admin/search/keywords?period=&top=` | ✅ `KeywordsPanel` — RAG 챗봇 질문 형태소 분석 기반 키워드 순위, 막대그래프 |
| GET | `/admin/rag/logs?user_id=&page=&size=` | ✅ `RagLogsPanel` — 전체 사용자 대상 검색-답변 로그, 클릭해서 펼치기 |

- 사이드바 "관리자" 섹션과 `/ai-ops` 페이지는 Embedding Lab과 같은 패턴으로
  `useAuth().user.role !== "admin"`이면 숨김/차단.
- `UsageBucket`(`prompt_tokens`/`completion_tokens`/`total_tokens`/`calls`/`estimated_cost_usd`)이
  usage summary·billing summary가 공유하는 최소 단위다. `estimated_cost_usd`는 백엔드가 litellm의
  실시간 가격표를 받아 계산한 추정치 — 표에 없는 모델이면 0으로 나올 수 있다는 점을 UI에
  안내했다(`InfoTooltip`).
- **`usage/summary.source`("actual"|"estimated")** — OpenAI Admin Usage API 키가 있으면
  `total`/`by_day`가 실제 값, 없으면 로컬 로그 기준 추정치(계측 시작 이후만 집계돼 과소 집계될
  수 있음)다. `by_feature`/`status_counts`는 OpenAI API가 모르는 개념이라 source와 무관하게 항상
  로컬 로그 기준. `UsagePanel`은 `source === "estimated"`일 때만 안내 문구를 보여준다.
- **`billing/summary`도 같은 이유로 `cost_source`("actual"|"estimated")를 갖고, `actual_available`은
  둘 다 정상 케이스다** — 키가 있으면 `true` + `daily_actual`(실제 일별 청구액 USD/KRW)이 채워지고,
  없으면 `false`에 `daily_actual`은 항상 빈 배열. 금액은 `today_usd`/`today_krw`/`this_month_usd`/
  `this_month_krw`가 최상위 필드로 오고(구 `today_estimated`/`this_month_estimated` 폐지, breaking
  change), 토큰/호출수만 `today_tokens`/`this_month_tokens`(`UsageBucket`)로 남는다.
  `UsagePanel`은 `cost_source === "estimated"`면 "실제 청구액 연동 대기 중" 안내만 보여주고
  `daily_actual` 리스트를 숨긴다.
- **비용 추이 차트(`UsagePanel`의 "비용 추이" 카드)** — 일별(이번 달 `usage/summary` `by_day`)·
  월별(올해 `usage/summary`의 `by_day`를 프론트에서 달 단위로 합산)·올해(연도 `total`, 점 하나라
  차트 대신 큰 숫자로 표시) 3단 토글. 각 포인트 호버 시 `<title>`로 USD·KRW를 함께 보여준다.
  **연도 간 비교는 지원하지 않는다** — `usage/summary`가 항상 "지금부터 그 period 시작까지"만
  주고 임의 과거 연도를 조회할 방법이 없어서, "올해"는 늘 현재 연도 하나뿐이다.
  `src/components/charts/index.tsx`의 `AreaTrend`(대시보드 문서 처리량 추이와 공유)에
  `tooltip`/`ariaLabel` 커스터마이즈 prop을 추가해 재사용했다.
  ⚠️ **`usage/summary?period=year`처럼 넓은 기간은 실제 OpenAI Usage/Costs API를 거치느라 느릴 수
  있다** — 기본 15초 타임아웃보다 오래 걸려 실패하는 걸 겪어서 `admin.ts`의 usage/billing
  엔드포인트만 `timeoutMs: 30000`으로 올렸고, 일별/월별 두 조회를 `Promise.all`로 묶지 않는다
  (하나가 느리거나 타임아웃 나도 다른 granularity는 그대로 쓸 수 있어야 해서).
- `usage/logs`·`rag/logs`는 `{items, total, page, size}` 모양(퀴즈의 `Paginated<T>`와 달리
  `limit`이 아니라 `size`) — `LLMUsageLogPage`/`RagAdminLogPage`로 따로 타입을 뒀다.
- `RagAdminLogRead.citations`는 `/rag/query` 응답의 citation과 같은 구조(`document_name` 등)이지만
  타입이 `Record<string, unknown>[]`라 필드가 자유롭다 — `RagLogsPanel`은 `document_name` 없으면
  `source`, 그것도 없으면 객체를 그대로 문자열화해서 보여준다.
- `search/keywords`는 형태소 분석(`kiwipiepy`)에 의존한다 — 백엔드 이미지에 이 패키지가 없으면
  브라우저 콘솔에는 CORS 에러로 보이지만 실제로는 500(미설치 모듈)이다. 프론트는 그 경우도 그냥
  `ErrorBanner`로 처리해 화면이 깨지진 않는다.

## 12. 아직 라우터 없음 (⏳)

- `/health` (✅ 존재, 프론트 미사용)

엔드포인트/스키마가 미확정인 백엔드 로드맵 백로그(PPT·즐겨찾기/메모·MCP)는
[roadmap.md](roadmap.md)로 옮겼다.
