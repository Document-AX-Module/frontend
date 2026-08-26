# RAG 검색 (`/search`)

엔드포인트는 [api-spec.md §11](../api-spec.md). 화면은 `RagSearchView`
(`src/components/search/RagSearchView.tsx`), 클라이언트는 `src/lib/rag.ts`.

## 레이아웃

좌측 사이드바(`aside`) + 우측 채팅 패널 2단 구성.

- **검색 범위**: `listProjects()`로 불러온, 접근 가능한 프로젝트 체크박스 목록. "전체 프로젝트"
  체크(기본값)는 특정 프로젝트를 하나도 고르지 않은 상태와 같다 — 이때 요청의 `scope` 자체를
  생략해 백엔드가 "접근 가능한 전체"로 처리하게 한다. 프로젝트를 하나라도 고르면 "전체
  프로젝트" 체크가 자동으로 풀린다.
- **대화**: `listConversations()`로 불러온 내 대화 목록(최근 수정순), "+ 새 대화" 버튼.
  대화 클릭 시 `getConversation(id)`로 전체 메시지를 불러와 채팅 패널에 그대로 복원한다.
  각 항목 옆 케밥(`IconMenu`)에서 "제목 수정"(`PromptDialog` → `renameConversation(id, title)`)과
  "삭제"(`ConfirmDialog` → `deleteConversation(id)`)를 제공한다. 삭제 대상이 활성 대화면
  `startNewConversation()`으로 초기화한 뒤, 두 작업 모두 성공 시 `listConversations()`로 목록을
  다시 불러온다.

## 질문 → 답변 흐름

1. 입력창에서 전송하면 사용자 메시지를 즉시 로컬 상태에 추가하고, 스트리밍 중인 빈 assistant
   메시지 자리를 만든다.
2. `queryStream()`이 `POST /rag/query/stream`을 연다. body는
   `{question, scope?, conversation_id?, top_k: 5}` — `conversation_id`는 활성 대화가 있을 때만
   보내 멀티턴으로 이어붙인다.
3. SSE 이벤트를 그대로 상태에 반영한다: `delta`마다 assistant 메시지에 텍스트를 이어붙이고,
   `citations`가 오면 그 메시지에 붙이고, `done`이 오면 스트리밍 표시(커서 깜빡임)를 끈다.
4. `done` 이후 `listConversations()`를 다시 불러와 목록의 제목/순서를 최신화한다(첫 메시지면
   새 대화가 목록에 나타나고, 기존 대화면 맨 위로 올라온다).
5. 검색/권한 오류(403/404/503)는 스트림을 열기 전에 `ApiError`로 던져지므로 assistant 메시지에
   에러 문구로 표시한다. LLM 자체 실패는 스트림 중 `error` 이벤트로 오며 `done` 없이 끝난다 —
   이 경우도 마찬가지로 해당 메시지에 에러로 표시한다.
6. 새로 보낼 때, 대화를 새로 시작할 때, 컴포넌트가 언마운트될 때 진행 중이던 스트림을
   `AbortController`로 취소한다.

## 인용 렌더링

- assistant 답변 본문은 백엔드 프롬프트가 마크다운 형식으로 출력하도록 지시하므로(`**굵게**`,
  목록, 표, 코드블록 등), 프론트는 이를 `react-markdown` + `remark-gfm`으로 렌더링한다
  (`.markdown-content` 클래스, `src/app/globals.css`에 디자인 토큰 기반 스타일 정의 — 프로젝트
  팔레트와 어긋나는 `@tailwindcss/typography`는 쓰지 않는다). 스트리밍 중 델타가 들어올 때마다
  다시 파싱되며, 닫히지 않은 마크다운 문법은 완성되기 전까지 리터럴로 보이다가 닫히는 순간
  렌더링된다 — ChatGPT류와 동일한 동작이라 스트리밍/완료 상태를 따로 분기하지 않는다.
- 답변 본문은 `[1]`처럼 `RagCitation.index`를 본문에 직접 언급하는 방식으로 GPT가 표기하지만,
  프론트는 이 표기를 링크로 바꾸지 않고 그대로 텍스트로 둔다.
- 인용 목록은 답변 아래 "출처" 섹션에 문서명 + `heading_path` + 페이지 범위 + `[index]` 배지로
  나열한다. `RagCitation.score`는 **하이브리드 RRF 융합 점수라 절대값이 아니다** —
  `retriever._rrf_fuse`가 벡터/FTS 각 목록의 **순위**만으로 `1/(k+rank)`(k=60)를 더해 계산하므로,
  실제 유사도·확률과 무관하고 최댓값도 잘해야 0.03대다(랭크 1등이 그대로 "3%"처럼 보이면 오히려
  오해를 준다). 그래서 절대 퍼센트로는 안 보여주고(과거 목업의 "94%" 표시를 제거한 이유), 대신
  각 출처 항목 아래 얇은 막대(`bg-surface-2` 트랙 + `bg-primary/60` 채움)로 **같은 답변 안
  citations 중 최고점 대비 상대 비율**만 그린다(`relativeCitationWidth()`,
  `RagSearchView.tsx`) — 답변끼리 막대 길이를 비교하는 건 의미 없고, 한 답변 안에서 어느 출처가
  더/덜 근거가 됐는지 순서·격차만 보여주려는 용도다. 인용 순서(`index`, 답변 본문의 `[1]` 표기와
  대응)는 기존처럼 배지로 별도 표시.
- "출처" 섹션 헤더 줄 오른쪽에 `ConfidenceBadge`(`primitives.tsx`)로 답변의 `confidence`(GPT
  자기신고 0~1, `RagCitation.score`와는 별개 축 — 근거가 있어도 GPT가 잘못 요약하면 낮게 나올 수
  있다)를 퍼센트 + 3단계 라벨("신뢰도 높음/보통/낮음", `confidenceTier()` 기준 0.75/0.4 분기)로
  노출한다. `done` SSE 이벤트와 대화 재조회(`RagMessage.confidence`) 양쪽에서 채워지며,
  `streaming` 중이거나 provider가 값을 안 줘 `null`이면 배지를 그리지 않는다. 인용이 없어도
  confidence만 있으면 헤더 줄은 그대로 표시된다.
- 각 출처 항목은 `/documents/{document_id}` (있으면 `?section={section_id}` 포함)로 가는
  링크이며, 채팅 맥락을 유지하도록 새 탭(`target="_blank"`)으로 연다. 문서 상세
  (`DocumentDetail.tsx`)는 `useSearchParams`로 이 `section` 쿼리를 읽어, 섹션 목록 로드가 끝나면
  기존 `focusSection`(교정 결과 클릭 시 쓰던 스크롤+하이라이트 함수)을 한 번만 자동 호출한다.

## 알아둘 것

- `POST /rag/search`(GPT 없는 검색)와 `POST /rag/query`(동기 답변)도 `rag.ts`에 클라이언트가
  있지만 이 화면은 스트리밍(`/rag/query/stream`)만 쓴다 — 검색 품질 점검용 UI가 따로 필요해지면
  그때 붙인다.
- `GET /rag/history`(최근 질문 한 줄 요약)는 대시보드 등 다른 화면에서 쓸 것을 대비해 클라이언트만
  만들어 뒀고, 이 화면은 `GET /rag/conversations`(대화 단위 목록)를 쓴다 — 용도가 다르다.
- 인증 가드는 다른 데이터 로딩 화면과 동일하게 `useAuth().loading`을 기다린 뒤에만 프로젝트/대화
  목록을 불러온다.
