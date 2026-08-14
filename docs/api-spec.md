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
  `current_version.processing_status` 사용(≠ `documents.status`="DRAFT"). 현재 파이프라인은 `CHUNKED`에서 종착.

## 4. AI — `src/lib/ai.ts`, `AiPanel`

| Method | Endpoint | 배선 |
|---|---|---|
| POST | `/documents/{id}/proofread` → **202 + RUNNING** | ✅ 폴링(`getAnalysis`) 후 결과 표시 |
| GET | `/documents/{id}/analyses?type=` | ✅ 최신 이력 로드 |
| GET | `/documents/{id}/analyses/{analysis_id}` → findings | ✅ 폴링 대상 |
| POST | `/documents/{id}/classify` · `/validate` · `/related` · `/documents/compare` | ⏳ |

- proofread finding = `{original, suggestion, reason, category(spelling/spacing/grammar/expression), section_id?, page_start/end?}`. finding 클릭 → 뷰어 `#sec-{section_id}` 스크롤+하이라이트.
- provider = `mock`(규칙기반) | `openai`(GPT). 백엔드에 `OPENAI_API_KEY` 넣으면 GPT로 전환.

## 5. 아직 라우터 없음 (⏳)

- 대시보드 `/dashboard/summary`, `/activity` — `dashboard.ts` 준비됨, 화면은 목업
- RAG `/rag/*` — `rag.ts` 준비됨, 화면은 목업
- Embedding Lab `/embedding/*` — `embedding.ts` 준비됨, 화면은 목업
- 전역 검색 `/search?q=`
- `/health` (✅ 존재, 프론트 미사용)
