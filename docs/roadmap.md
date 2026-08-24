# 로드맵 · 미배선 영역 · 플랫폼 컨텍스트

배선이 끝난 화면은 [features/](features/)에 있다. 이 문서는 **아직 목업이거나 백엔드가 없는
것**을 모은다. 엔드포인트 배선 현황 표는 [api-spec.md](api-spec.md).

## 지금 목업인 화면

| 화면 | 클라이언트 | 상태 |
|---|---|---|
| RAG 검색 `/search` | `src/lib/rag.ts` 준비됨 | 백엔드 `/rag/*` 미구현 → 화면은 목업 |
| 퀴즈 `/quiz` | 없음 | 엔드포인트/스키마 미확정(§ 아래 백로그) → 예시 문항만 있는 정적 목업 |
| Embedding Lab `/embedding-lab` | `src/lib/embedding.ts` 준비됨 | 백엔드 `/embedding/*` 미구현 |
| `AiPanel`의 `규정 검증`·`관련 문서` 탭 | `ai.ts`에 함수만 있음 | 백엔드 미구현 |

`ai.ts`의 `classify`/`validate`/`related`는 **호출 코드만 있고 실제로 200을 받은 적이 없다** —
붙일 때 응답 스키마를 백엔드와 다시 맞춘다.

여기 있었던 세 항목은 배선이 끝나 빠졌다: **알림 벨 · Web Push**(→
[features/notifications.md](features/notifications.md)), **멤버 초대 UX 3종**(사용자 검색 ·
초대 대기 상태 · 초대 알림 → [features/projects-documents.md](features/projects-documents.md)),
**맞춤법 검사기(텍스트 직접 입력) `/proofread`**(문서 미등록 텍스트를 202+폴링으로 검사 + 승인/
반려 + 새 문서로 저장 + `listTextProofreadJobs()`로 마운트 시 이어받기 + 완료 시 알림/웹푸시 →
[features/proofread.md](features/proofread.md)).

## AI 기능 모듈

각각 Document Core가 먹여주는 별개의 프론트 표면이다.

1. **오타/맞춤법 검증 (Proofread)** — ✅ 배선 완료. 문서 상세는 비동기 202 + 폴링, finding
   승인/반려, 수정본 적용까지. `/proofread` 페이지는 문서 미등록 텍스트를 같은 202+폴링 방식으로
   검사하고(완료/실패는 알림·웹푸시로 통지) 승인된 교정만 에디터에 반영한 뒤 새 문서로 저장한다.
   category = spelling/spacing/grammar/expression → [proofread.md](features/proofread.md)
2. **RAG Chat** — 질문 → 임베딩 → pgvector + full-text 하이브리드 검색 → GPT → 답변 + 인용. ⏳
3. **문서 자동 분류 (Classification)** — type/category/tags. ⏳
4. **관련 문서 추천 (Related)** — 임베딩 벡터 검색. ⏳
5. **Document Diff (버전 비교)** — ✅ 배선 완료. GPT가 아니라 `difflib` 동기 계산 → 섹션 단위
   added/deleted/modified/unchanged + 토큰 단위 diff → [document-diff.md](features/document-diff.md)
6. **규정 검증 (Regulation validation)** — `RULE` 문서를 근거로 retrieval + GPT 검증. ⏳

## 백엔드 로드맵 백로그 (2026-08-19 기준)

백엔드 `api-spec.md` §6-1·§8~§11에 **방향성만** 기록된 항목들. 엔드포인트/스키마가 미확정이라
`src/lib/*.ts`에 아직 아무것도 없다. **착수 전 백엔드 스키마 확정 여부부터 확인할 것.**

- **퀴즈** `/quizzes/*` — RAG Retrieval Engine을 재사용하므로 RAG가 먼저 구현돼야 착수 가능.
- **PPT 지원** — 새 엔드포인트 없음. 기존 문서/AI 엔드포인트가 PPTX에서도 동작하게 만드는 백엔드
  내부 작업이라, 프론트 변경은 상태 폴링이 `FAILED`가 아니라 정상 파이프라인을 타는 정도.
- **즐겨찾기/메모/Notion 연동** `/documents/{id}/favorite`, `/favorites`,
  `/documents/{id}/notes` — 엔드포인트 미확정. 메모가 문서 단위인지 섹션 단위인지도 미정.
- **MCP 서버** — REST 엔드포인트가 아니라 이 리포와 무관하다. Document Core를 외부 에이전트에
  tool로 노출하는 백엔드 인프라.

## 백엔드 · 플랫폼 컨텍스트

프론트는 REST API만 상대하지만, 왜 이런 응답이 오는지 알아야 할 때가 있다.

- **LLM**: OpenAI GPT + 규칙 기반 `MockLLMProvider` 폴백. 오타 검증은 지금 mock으로도 동작하고,
  백엔드에 `OPENAI_API_KEY`를 넣으면 GPT로 바뀐다(프론트 변경 없음).
- **임베딩**: **로컬** 모델(BGE-M3 / KURE-v1 / Qwen3)을 실제 문서로 벤치마크하고, 활성 모델은
  서버에 저장한다.
- **DB**: PostgreSQL + pgvector (`vector(1024)`). **저장소**: 로컬 파일 + Docker 볼륨.
- 파이프라인이 `CHUNKED`에서 멈추는 이유(`EMBEDDING→READY`는 Phase 9 대기)는
  [architecture.md](architecture.md).

기능을 추가할 때는 백엔드 스키마를 해당 `src/lib/*.ts` 클라이언트에 미러링하고, 배선 현황을
[api-spec.md](api-spec.md)에 갱신한다.
