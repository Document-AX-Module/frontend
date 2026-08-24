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

## 별도 흐름: `/proofread` — 문서 없이 텍스트 검사 → 새 문서로 저장

위 내용은 전부 **이미 등록된 문서**에 대한 `AiPanel` 흐름이다. `/proofread`
(`src/app/proofread/page.tsx`)는 완전히 다른 진입점으로, Document Core에 아직 등록되지 않은
텍스트를 검사한 뒤 **새 문서를 만드는** 흐름이다.

- 입력은 Toast UI Editor(`src/components/proofread/TextEditor.tsx`, **markdown 모드**, `previewStyle:
  "tab"`로 미리보기는 기본 숨김). wysiwyg 모드는 자체 내부 vdom(`innerDiff`/`removeNode`)으로
  contenteditable을 렌더링하는데, 한글 IME 조합처럼 브라우저가 DOM을 직접 건드리는 상황과 충돌해
  `Failed to execute 'removeChild' on 'Node'` 크래시를 낸다(`nhn/tui.editor` 저장소의
  [#2765](https://github.com/nhn/tui.editor/issues/2765)와 동일 증상). `@toast-ui/react-editor`
  공식 래퍼는 `peerDependencies: react ^17`에 묶여 있어 이 프로젝트의 React 19와 안 맞아 쓸 수
  없다 — markdown 모드(CodeMirror 기반)로 바꿔 이 내부 렌더러 자체를 안 타게 하는 게 해법이다.
  서식 있는 편집이 필요 없는 평문 입력창이라 기능 손해도 없다. 검사는
  `startTextProofread()`(`src/lib/ai.ts`) → `POST /text/proofread`에 `getText()`(plain text)를
  보내는 **비동기** 호출 — 문서 오타 검증과 동일하게 202 + `RUNNING` job을 받고 폴링한다.
  finding shape은 `TextProofreadFinding` = `{id, original, suggestion, reason, category}` —
  `section_id`/`page_start/end`/`status`가 없다(문서·분석에 안 묶임).
- **승인/반려는 서버에 저장되지 않는다.** `AiPanel`과 같은 pill UI를 재사용하지만, finding
  상태는 페이지 로컬 state(`Finding = TextProofreadFinding & { status: FindingStatus }`)로만
  관리한다. `전체 승인`/`전체 선택 해제`(`AiPanel`과 동일한 패턴)로 findings를 일괄 변경할 수도
  있다.
- **폴링·재개는 `AiPanel`과 완전히 같은 패턴이다.** `pollRef`의 `{ cancelled }` 토큰으로 취소하고,
  언마운트 시 `stopPolling()`한다(안 그러면 늦게 도착한 응답이 이미 제거된 DOM을 React가 다시
  건드리려다 `removeChild` 에러로 이어진다). 마운트 시 `listTextProofreadJobs()`로 내 최근 job을
  조회해(`listAnalyses`와 같은 역할) `RUNNING`이면 폴링을 재개하고, `COMPLETED`/`FAILED`면 결과를
  그대로 복원한다 — 검사 중 다른 페이지로 이동해도 서버 쪽 진행 상황은 안 사라진다.
- **완료/실패 시 알림 + 웹푸시.** 타입 `text_proofread.complete`/`text_proofread.fail`,
  `url`은 고정 `/proofread`. 알림 벨/푸시 인프라를 그대로 탄다([notifications.md](notifications.md)).
- **알려진 한계 — 원본 입력 텍스트는 서버에 없다.** `text_proofread_jobs`는
  `user_id/status/provider/result/error`만 저장하고 제출한 텍스트 자체는 안 남긴다. 그래서
  검사 시작 시점의 마크다운을 `localStorage`(`proofread:draft-markdown`)에도 남겨서, 알림을 타고
  돌아왔을 때 결과뿐 아니라 원래 쓰던 텍스트도 같이 보이게 한다. 서버 job과 이 로컬 초안은
  독립적이라, 다른 기기/브라우저에서 알림을 열면 결과는 보여도 원문은 비어 있을 수 있다.
- **"승인한 교정 N건 에디터에 적용"** — `editorRef.current.getMarkdown()`으로 현재 마크다운을
  읽어 승인된 finding마다 `original` → `suggestion` 문자열 치환 후 `setMarkdown()`으로
  되돌린다(`TextEditorHandle`에 새로 추가한 쓰기 메서드). **알려진 한계**: 같은 `original`
  문자열이 본문에 여러 번 나오면 전부 치환된다 — 백엔드가 문자 오프셋을 안 주는 건 문서 쪽
  finding과 동일하다.
- **"새 문서로 저장"** — `SaveAsDocumentDialog`(`src/components/proofread/
  SaveAsDocumentDialog.tsx`, `MoveDocumentDialog`와 같은 프로젝트/폴더 선택 패턴)를 연다.
  제목까지 정하고 저장하면 에디터의 최종 마크다운을 `.md` `File`로 감싸 **기존**
  `uploadDocument()`(`POST /projects/{id}/documents`, 멀티파트)를 그대로 호출한다 — 저장
  전용 신규 API는 없다. 성공하면 기존 File→Version→Section→Chunk 파이프라인을 그대로 타는
  진짜 문서가 생긴다.
