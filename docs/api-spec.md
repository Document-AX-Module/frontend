# API 계약 + 프론트 배선 현황

> **Source of truth**: 백엔드(`sidepjt/backend`)의 `api-spec.md`와 `/openapi.json` (+ `/docs`).
> 이 문서는 **프론트가 실제로 소비하는 것과 배선 여부**를 정리한다. 타입은 `src/lib/types.ts`가
> 백엔드 Pydantic 스키마를 snake_case로 미러링한다.

- Base: `NEXT_PUBLIC_API_BASE_URL` (기본 `http://localhost:8000`) + `/api/v1`
- 인증: `Authorization: Bearer <access>` + refresh는 백엔드 오리진 httpOnly 쿠키
- 에러: `{ "detail": string }` · 목록 페이지네이션 `?page=&limit=`
- 배선: ✅ 프론트 연동 완료 · 🔶 백엔드 ✅ but 프론트 미배선 · ⏳ 백엔드 미구현

## 1. 인증 — `src/lib/auth.ts`, `AuthProvider`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/auth/providers` → `{ providers: string[] }` | ✅ `/login` |
| GET | `/auth/login/{provider}` (백엔드가 IdP로 리다이렉트) | ✅ `loginWith` |
| GET | `/auth/callback/{provider}` (refresh 쿠키 설정 → `/auth/callback`로 리다이렉트) | ✅ (route handler) |
| POST | `/auth/token/refresh` → `{ access_token, expires_in }` | ✅ 부트스트랩 + 401 자동재발급 |
| POST | `/auth/logout` (204) | ✅ Topbar |
| GET | `/auth/me` → `{ id, email, name, role }` | ✅ (initials는 프론트 파생) |

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
| GET | `/documents/{id}/download` | ✅ (Bearer로 blob 저장) |
| GET | `/documents/{id}/versions` | ✅ |
| GET | `/versions/{id}` · `/versions/{id}/status` | ✅ 폴링 |
| GET | `/versions/{id}/sections` | ✅ 개요/뷰어 |
| GET | `/versions/{id}/chunks` | 🔶 |
| PATCH | `/documents/{id}` (RULE 지정 등) | ⏳ |

- **상태**: `UPLOADED·PARSING·PARSED·CHUNKING·CHUNKED·EMBEDDING·READY·FAILED`. 배지는
  `current_version.processing_status` 사용. `documents.status`는 삭제됐다(마이그레이션 `72b852f975d6`) —
  버전이 없으면 `UPLOADED`로 본다. 현재 파이프라인은 `CHUNKED`에서 종착.

## 4. AI — `src/lib/ai.ts`, `AiPanel`

| Method | Endpoint | 배선 |
|---|---|---|
| POST | `/documents/{id}/proofread` → **202 + RUNNING** | ✅ 폴링(`getAnalysis`) 후 결과 표시 |
| GET | `/documents/{id}/analyses?type=` | ✅ 최신 이력 로드 |
| GET | `/documents/{id}/analyses/{analysis_id}` → findings | ✅ 폴링 대상 |
| POST | `/documents/{id}/classify` · `/validate` · `/related` · `/documents/compare` | ⏳ |

- proofread finding = `{original, suggestion, reason, category(spelling/spacing/grammar/expression), section_id?, page_start/end?}`. finding 클릭 → 뷰어 `#sec-{section_id}` 스크롤+하이라이트.
- provider = `mock`(규칙기반) | `openai`(GPT). 백엔드에 `OPENAI_API_KEY` 넣으면 GPT로 전환.

## 5. 대시보드 — `src/lib/dashboard.ts`, `DashboardView`

| Method | Endpoint | 배선 |
|---|---|---|
| GET | `/dashboard/summary?project_id=` | ✅ 스탯/차트/파이프라인 |
| GET | `/activity?limit=&project_id=` | ✅ 최근 활동 피드 |
| GET | `/documents/recent?limit=&project_id=` | ✅ "최근 문서" 카드 (`documents.ts`) |

- 대시보드는 이 **3요청을 `Promise.all`로 한 번에** 던진다. `/documents/recent`는 집계가 아니라
  목록이고 `limit`을 독립적으로 주므로 `summary`에 얹지 않고 별도 엔드포인트로 유지한다.
  클라이언트는 `src/lib/dashboard.ts`가 아니라 **`documents.ts`** 에 둔다(경로 도메인이 documents).
- `RecentDocumentRead`는 **snake_case** 다 — camelCase는 `summary`/`activity` 두 응답에만 적용된다.
  `project_name`과 `processing_status`(현재 버전 기준, 버전 없으면 `UPLOADED`)가 납작하게 펼쳐져
  오므로 문서별 추가 조회 없이 프로젝트 경로 + `StatusBadge`를 바로 그린다.
- **라우트 순서 주의**: 백엔드가 `/documents/recent`를 `/documents/{document_id}` 보다 먼저 등록해야
  한다(안 그러면 `recent`가 int로 파싱돼 422). 프론트에서 깨질 일은 없지만 백엔드 리팩터링 시 주의.
- ⚠️ **`project_id` 처리가 엔드포인트마다 다르다**: 없는 프로젝트를 주면 `/documents/recent`는
  **404**, `/dashboard/summary`는 **200**(빈 집계)이다. 지금 대시보드는 `project_id`를 안 보내지만,
  프로젝트 스코프 대시보드를 만들면 `Promise.all` 하나가 404로 전체를 실패시킨다.

- **이 두 응답만 camelCase**(`ragToday`, `weeklyProcessing`, `documentTypes`) — 프론트가 먼저 확정해 둔
  계약에 백엔드가 `alias_generator=to_camel`로 맞춘 것. 나머지 API는 snake_case 그대로다.
- 백엔드가 의도적으로 클라이언트에 남긴 파생값:
  - `weeklyProcessing`은 **UTC** 기준 최근 7일(마지막 원소=오늘)이고 요일 고정이 아니라 **축 라벨을
    프론트가 오늘 날짜로 계산**한다 (`weekdayLabels()`도 UTC로 계산 — 안 그러면 KST 오전에 마지막
    칸이 "오늘"이 아니게 된다).
  - `pipeline[].status`는 `DocStatus` 원값이라 한글 라벨은 프론트 담당 → `statusLabel()`
    (`primitives.tsx`의 `STATUS_STYLES` 재사용, 중복 정의 금지).
  - `at`은 ISO8601 → "10분 전" 상대표기는 프론트에서 만든다.
- `pipeline`은 0건 단계도 8개 전부 고정 순서로 내려오므로 `PipelineStrip` 칸 수가 흔들리지 않는다.
  집계 기준은 **현재 버전의 `processing_status`** 다(`documents.status`는 삭제됨).
- **활동 피드는 `activity_logs` 테이블 기반**이다(마이그레이션 `1e199411435d`). DB에는 표시 문구가
  아니라 액션 코드(`document.upload`, `analysis.start` …)가 들어가고, 문구·배지 `kind`는 읽을 때
  `activity_service.describe()`가 만든다. 그래서 **`kind`는 프론트가 열거해야 하는 값 집합**이다 —
  `ACTION_LABELS` + `ANALYSIS_LABELS` + 폴백 2개 = **11개**:
  `로그인 · 프로젝트 · 폴더 · 삭제 · 업로드 · 오타 · 분류 · 규정 · 추천 · 분석 · 기타`.
  (`분석` = 모르는 `analysis_type` 폴백, `기타` = 미등록 액션 코드 폴백. 백엔드에 코드를 추가하면
  `DashboardView`의 `KIND_TONE`도 같이 늘려야 한다.)
- **배지 색은 kind별이 아니라 클래스별 4톤**이다 — 11색은 구분이 안 되므로 접었고, 배지 텍스트가
  이미 kind를 말하므로 색은 *분류*만 나른다. `삭제`=브랜드 레드(파괴적) · AI 분석 5종=violet ·
  `업로드/프로젝트/폴더`=sky · `로그인/기타`=중립. 피드는 kind가 임의 순서로 섞이므로 **전체 쌍**으로
  검증했다(`#b01c2e`/`#6d28d9`/`#0369a1` 전 항목 PASS). amber는 브랜드 레드와 ΔE 10.6(하한 15)으로
  **탈락** — 삭제 톤과 같은 피드에 못 둔다.
- `analysis.start`/`complete`/`fail`이 각각 로그로 남아 한 번 실행에 피드 항목이 2건 생긴다(시작+완료).
- 대상이 없는 활동(`로그인`)은 `target`이 빈 문자열로 오므로 그 줄을 렌더하지 않는다.
- **문서 링크 규칙** (`canLinkToDocument()`) — 두 절 모두 필수다:

  ```ts
  targetType === "document" && targetId != null && targetAlive
  ```

  - `targetType` — id가 테이블별이라 `project` 행의 `targetId`가 무관한 **문서** id와 겹친다.
    404가 아니라 200으로 엉뚱한 파일이 열리는 조용한 오동작이라 404보다 나쁘다.
  - `targetAlive` — 로그가 대상보다 오래 살아남으므로 `업로드`/`오타` 행도 대상이 나중에
    삭제됐으면 404다. 삭제된 대상 전체를 덮으므로 **`kind` 검사는 두지 않는다** — `kind`는
    표시용 한글 문자열이라 문구가 바뀌면 조용히 깨진다. `targetId`는 삭제 후에도 유지된다
    (감사 로그에서 "삭제된 문서 8"과 "대상 없음"은 다른 사실).

  실제 로그 22행으로 측정한 규칙별 실패 양상:

  | 규칙 | 링크 | 정상 | 404 | **엉뚱한 문서로 이동(200)** |
  |---|---|---|---|---|
  | `kind !== "삭제"` 만 | 13 | 2 | 6 | **5** |
  | `targetType` + `targetAlive` | 2 | 2 | **0** | **0** |

- **닫을 수 없는 구멍**: `targetAlive`는 응답 생성 시점의 스냅샷이라, 렌더와 클릭 사이에 다른
  사용자가 지우면 여전히 404다(재현 확인). 서버가 원천 차단할 수 없는 종류이므로
  `DocumentDetail`의 "문서를 찾을 수 없습니다" 배너를 백스톱으로 유지한다.
- **미구현으로 남은 값**: `stats.ragToday`는 항상 0(RAG가 MVP2) → 타일에 `RAG 미구현` 배지를 붙여
  실측값처럼 보이지 않게 했다. `규정/분류/추천` kind는 해당 AI 모듈이 붙어야 실제로 나온다.
- `/activity`의 `action=`(코드 필터), `project_id=` 파라미터는 아직 프론트에서 안 쓴다.
- 스탯 타일에 **증감 배지·스파크라인 없음** — 과거 시점 데이터 소스가 없어 제거했다. 주간 추이는
  아래 `AreaTrend`가 담당한다.
- `stats.processing > 0`인 동안만 15초 간격으로 재조회한다(파이프라인 카드의 "실시간" 표기 근거).

## 6. 아직 라우터 없음 (⏳)

- RAG `/rag/*` — `rag.ts` 준비됨, 화면은 목업
- Embedding Lab `/embedding/*` — `embedding.ts` 준비됨, 화면은 목업
- 전역 검색 `/search?q=`
- `/health` (✅ 존재, 프론트 미사용)
