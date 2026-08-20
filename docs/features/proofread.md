# AI 오타 검증 (Proofread)

`AiPanel` (`src/components/document/AiPanel.tsx`) — `DocumentDetail`의 오른쪽 열. 엔드포인트는
[api-spec.md §4](../api-spec.md). AI 패널 탭 4개 중 **`오타 검증`만 배선**돼 있고
`규정 검증`/`문서 비교`/`관련 문서`는 목업이다 → [roadmap.md](../roadmap.md).

`provider`는 백엔드가 고른다: `mock`(규칙 기반) 또는 `openai`(GPT). 백엔드에 `OPENAI_API_KEY`를
넣으면 GPT로 전환되고 프론트는 바뀌지 않는다.

## 실행 전 조건

`status`가 `UPLOADED`/`PARSING`이면 실행 버튼을 막는다(`NOT_READY`). 이 상태에서 호출하면
백엔드가 **409**를 주므로, 409는 "문서 분석이 끝난 뒤에 실행할 수 있어요"로 번역한다.

## 비동기 실행 → 폴링

`POST /documents/{id}/proofread`는 **202 + `RUNNING` 레코드**를 준다. 결과는 폴링으로 받는다.

- `poll(analysisId)` — 2초 간격, 최대 90회. `COMPLETED`/`FAILED`에서 멈춘다. 중간 요청이
  실패하면 루프를 죽이지 않고 `continue`한다(일시적 에러로 진행 상황을 잃지 않게).
- **취소 토큰** — `pollRef`의 `{ cancelled }` 객체. 문서를 옮기거나 재실행할 때 이전 루프가
  뒤늦게 `setResult`로 옛 결과를 덮어쓰지 못하게 한다.
- **마운트 시 이어받기** — `listAnalyses(docId, "proofread")`로 가장 최근 분석을 읽고, 그것이
  아직 `RUNNING`이면 폴링을 재개한다. 그래서 새로고침해도 진행 중인 검사가 사라지지 않는다.

## finding 표시

finding = `{ id, original, suggestion, reason, category, status, section_id?, page_start/end? }`.

- `id`는 한 분석 안에서 고정된 **위치 기반** 값(`f0`, `f1`…)이다 — 분석 간에 안정적이지 않다.
- `category` 4종에 한글 라벨과 색을 매핑한다: `spelling` 맞춤법 · `spacing` 띄어쓰기 ·
  `grammar` 문법 · `expression` 표현. 모르는 값은 원문자열 + 중립 톤으로 폴백한다.
- finding 클릭 → 뷰어의 `#sec-{section_id}`로 스크롤 + 하이라이트. 이때 **지적된 문구를 함께
  넘겨** 섹션 전체가 아니라 해당 단어만 강조한다.

## 승인 / 반려

`PATCH /documents/{id}/analyses/{analysisId}/findings/{findingId}` → `status`를
`pending`/`accepted`/`rejected`로 바꾼다. 응답은 갱신된 findings를 포함한 **분석 전체**다.

`updateFinding()`은 낙관적 업데이트를 한다: 먼저 로컬 상태를 바꾸고, 실패하면 이전 결과로
롤백하고 에러를 띄운다.

## 수정본 적용 (새 버전 생성)

`POST /documents/{id}/analyses/{analysisId}/apply` → 그 시점까지 `accepted`인 finding을 원본
파일에 반영해 **새 버전**을 만든다. 응답 `ApplyAnalysisResult` =
`{ analysis_id, document_id, new_version_id, new_version_no, applied_count, skipped_count, skipped_reasons }`.

- **분석 1건당 1회만** 가능하다. 이미 적용한 분석에 다시 호출하면 **409**.
- **적용 여부의 진짜 출처는 서버의 `applied_version_id`**다. 로컬 `appliedAnalysisId`는 방금 이
  세션에서 적용한 경우를 즉시 반영하기 위한 보조값일 뿐이다:

  ```ts
  const applyLocked = result != null &&
    (result.applied_version_id != null || appliedAnalysisId === result.id);
  ```

- 적용이 끝나면 `onApplied(new_version_id)` → `DocumentDetail`이 `load(true)`로 새 버전을
  다시 읽는다.
- **적용 후에는 finding 점프 버튼을 감춘다.** 뷰어가 이미 새 버전의 섹션을 보여주는데
  재파싱으로 `section_id`가 바뀌었으므로, 옛 `section_id`를 가리키는 버튼은 눌러도 아무 일이
  없는 죽은 버튼이 된다.
- **PDF 주의**: 완전 편집이 아니라 시각적 패치로 적용되므로 원본과 폰트가 미세하게 다를 수
  있다 — `fileExt === "pdf"`일 때 그 안내 문구를 버튼 아래에 띄운다.
