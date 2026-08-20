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
| GET/POST | `/projects` | ✅ 목록/생성 (`ProjectsView`) |
| GET/PATCH/DELETE | `/projects/{id}` | ✅ 상세/삭제 (PATCH 미사용) |
| GET/POST | `/projects/{id}/folders` | ✅ 트리/생성 (`FolderTree`) |
| PATCH/DELETE | `/folders/{id}` | ✅ 이름변경/삭제 |
| GET | `/projects/{id}/members` | ⏳ |

- `ProjectRead` = `{id, name, description, created_by, created_at, updated_at}` — 집계(문서수/READY수/members)는 백엔드 미제공이라 목록 카드에서 생략.

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
| PATCH | `/documents/{id}` (RULE 지정 등) | ⏳ |

- **상태**: `UPLOADED·PARSING·PARSED·CHUNKING·CHUNKED·EMBEDDING·READY·FAILED`. 배지는
  `current_version.processing_status` 사용. `documents.status`는 삭제됐다(마이그레이션 `72b852f975d6`) —
  버전이 없으면 `UPLOADED`로 본다. 현재 파이프라인은 `CHUNKED`에서 종착.
- 오타 검증 **수정본 적용(§4)이 새 버전을 만든다** — 적용 후에는 `current_version`이 바뀌고
  섹션도 재파싱되므로 `section_id`가 달라진다.

## 4. AI — `src/lib/ai.ts`, `AiPanel`

| Method | Endpoint | 배선 |
|---|---|---|
| POST | `/documents/{id}/proofread` → **202 + RUNNING** | ✅ 폴링(`getAnalysis`) 후 결과 표시 |
| GET | `/documents/{id}/analyses?type=` | ✅ 최신 이력 로드 · 실행 중이면 폴링 재개 |
| GET | `/documents/{id}/analyses/{analysis_id}` → findings | ✅ 폴링 대상 |
| PATCH | `/documents/{id}/analyses/{analysis_id}/findings/{finding_id}` (`{status}`) → 분석 전체 | ✅ 승인/반려/보류 |
| POST | `/documents/{id}/analyses/{analysis_id}/apply` → `ApplyAnalysisResult` | ✅ 분석 1건당 1회 (재호출 **409**) |
| POST | `/documents/{id}/classify` · `/validate` · `/related` · `/documents/compare` | ⏳ |

- proofread finding = `{id, original, suggestion, reason, category(spelling/spacing/grammar/expression), status(pending/accepted/rejected), section_id?, page_start/end?}`.
  `id`는 한 분석 안에서만 고정된 위치 기반 값(`f0`, `f1`…). finding 클릭 → 뷰어 `#sec-{section_id}` 스크롤+하이라이트.
- 파싱이 끝나기 전(`UPLOADED`/`PARSING`)에 proofread를 호출하면 **409** → 실행 버튼을 막는다.
- `ApplyAnalysisResult` = `{analysis_id, document_id, new_version_id, new_version_no, applied_count, skipped_count, skipped_reasons}`.
  적용 여부의 진짜 출처는 분석의 `applied_version_id`/`applied_at`이다.
- PDF는 완전 편집이 아니라 **시각적 패치**로 적용되므로 폰트가 미세하게 달라질 수 있다(UI에 안내).
- provider = `mock`(규칙기반) | `openai`(GPT). 백엔드에 `OPENAI_API_KEY` 넣으면 GPT로 전환.

동작 상세는 [features/proofread.md](features/proofread.md).

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

## 7. 아직 라우터 없음 (⏳)

- RAG `/rag/*` — `rag.ts` 준비됨, 화면은 목업
- Embedding Lab `/embedding/*` — `embedding.ts` 준비됨, 화면은 목업
- 전역 검색 `/search?q=` — Topbar 검색 입력이 스텁
- 알림 `/notifications` — Topbar 벨이 스텁
- `/health` (✅ 존재, 프론트 미사용)

엔드포인트/스키마가 미확정인 백엔드 로드맵 백로그(퀴즈·PPT·알림·즐겨찾기/메모·MCP)는
[roadmap.md](roadmap.md)로 옮겼다.
