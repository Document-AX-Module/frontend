# AI 운영 대시보드 (`/ai-ops`)

`src/app/ai-ops/page.tsx` + `src/lib/admin.ts` + `src/components/ai-ops/*`.
사이드바 "관리자" 섹션에서 들어간다. 엔드포인트는 [api-spec.md §13](../api-spec.md). **전부
`require_admin`**이라 관리자가 아니면 403이 난다.

## 접근 제어

- Embedding Lab과 완전히 같은 패턴 — `useAuth().user.role !== "admin"`이면 페이지가
  `ErrorBanner`만 보여주고 아무것도 불러오지 않는다(로그인 안 됨 → `needLogin`, 로그인은 됐지만
  admin 아님 → 권한 메시지).
- 사이드바의 "관리자" 섹션(AI 운영 링크)도 같은 조건으로 숨긴다 — `Sidebar.tsx`의 `adminNav`.

## 구성 — 탭 4개

`Embedding Lab`/`QuizBookDetail`과 같은 밑줄 탭 패턴(`FOCUS_RING`, `border-b-2 border-primary`)을
페이지 레벨에서 재사용한다.

### 1. 토큰 사용량 (`UsagePanel`)

- `getUsageSummary(period)`(일/월/년, `Dropdown` chip)로 총 토큰/호출/평균, 기능별 표를 그린다.
  `getBillingSummary()`는 기간 선택과 무관하게 한 번만 불러온다(오늘/이번 달 고정).
- **`estimated_cost_usd`는 추정치다** — litellm이 공개 유지하는 모델별 가격표를 백엔드가 실시간
  조회해 계산하므로, 표에 없는 모델이면 0으로 나올 수 있다. `InfoTooltip`으로 안내한다.
- **`usage/summary.source`/`billing/summary.cost_source`가 "actual"/"estimated" 둘 다 정상
  케이스다.** OpenAI Admin API 키가 서버에 설정돼 있으면 실제 값(`actual`) — 비용 요약은
  `today_usd`/`today_krw`/`this_month_usd`/`this_month_krw` + `daily_actual`(실제 일별 청구액)까지
  채워진다. 없으면 `estimated`로 로컬 로그 기반 추정치를 쓰고, `daily_actual`은 항상 빈 배열이라
  "실제 청구액 연동 대기 중" 안내만 띄우고 리스트는 숨긴다. **UI가 한쪽 상태만 정상으로 가정하고
  만들면 안 된다.**
- **비용 추이 차트** — "일별"/"월별"/"올해" 토글(`Dropdown` chip, `조회 기간`과는 별개 상태).
  일별은 이번 달 `usage/summary`의 `by_day`, 월별은 올해 `usage/summary`의 `by_day`를 프론트에서
  달 단위로 합산, 올해는 `total` 하나뿐이라 차트 대신 큰 숫자 타일로 보여준다. 점마다 호버하면
  `<title>`로 USD·KRW를 함께 보여준다(`AreaTrend`의 `tooltip` prop). **연도 간 비교는 안 된다** —
  `usage/summary`가 항상 "지금부터 그 period 시작까지"만 주는 API라 과거 연도를 조회할 방법이
  없다.
  - ⚠️ 넓은 기간(특히 `period=year`)은 실제 OpenAI Usage/Costs API를 거치느라 수 초~십수 초
    걸릴 수 있다. 처음엔 기본 15초 타임아웃에 걸려 실패했고(월/년을 `Promise.all`로 묶어서 하나가
    타임아웃 나면 둘 다 죽는 구조였다), `admin.ts`의 usage/billing 엔드포인트만
    `timeoutMs: 30000`으로 올리고 월/년 조회를 독립된 호출로 분리해 하나가 느려도 다른
    granularity는 그대로 쓸 수 있게 고쳤다.

### 2. 검색 키워드 순위 (`KeywordsPanel`)

- `getSearchKeywords(period, top)` → 막대그래프(최댓값 기준 상대 폭). 기간 선택 공유.
- 백엔드가 질문을 형태소 분석(`kiwipiepy`)해서 명사만 뽑아 카운트한다 — **이 패키지가 백엔드
  이미지에 설치돼 있지 않으면 500이 난다.** 브라우저 콘솔에는 CORS 에러로 찍히지만(에러 응답에
  CORS 헤더가 안 붙는 FastAPI/Starlette의 흔한 증상) 실제 원인은 서버 쪽 미설치 모듈이다 —
  `docker compose build backend`로 이미지를 재빌드해야 한다. 프론트는 이 경우도 그냥
  `ErrorBanner`로 처리해 화면이 깨지진 않는다.

### 3. 호출 로그 (`UsageLogsPanel`)

- `listUsageLogs({feature, status, page, size})` — 기능/상태 `Dropdown` chip 필터 + `Pager`
  (`src/components/ui/Pager.tsx`, 관리자 로그 두 화면이 공유).
- 상태 배지는 `primitives.tsx`의 `llmCallStatusLabel`/`LLMCallStatusBadge`가 유일한 출처다
  (CLAUDE.md 규칙 4) — success/fail 2종.

### 4. 검색·답변 로그 (`RagLogsPanel`)

- `listRagLogs({page, size})` — 전체 사용자 대상(관리자 전용이라 스코프 제한 없음).
- 답변이 길 수 있어 목록에서는 80자로 자르고, 행을 클릭하면 펼쳐서 전문 + 근거(citation) 문서명을
  보여준다. `citations`는 백엔드 타입이 `Record<string, unknown>[]`로 느슨해서
  `document_name` → `source` → JSON 문자열화 순으로 폴백한다.

## 공용 조각

- **`Pager`**(`src/components/ui/Pager.tsx`) — 이전/다음 + "N / 총페이지" 표시. `usage/logs`·
  `rag/logs` 응답이 `{items, total, page, size}` 모양(퀴즈의 `Paginated<T>`와 달리 `limit`이 아니라
  `size`)이라 별도 페이지 타입(`LLMUsageLogPage`/`RagAdminLogPage`)을 뒀다.
- **`aiOpsFormat.ts`** — 이 대시보드 전용 날짜/숫자/통화(USD·KRW) 포맷 헬퍼(`quizFormat.ts`와
  같은 위치의 역할).

## 하지 않는 것

- 로그 상세(원본 프롬프트/응답 전체, RAG 로그의 답변 제외)는 보여주지 않는다 — 백엔드 응답에
  없는 필드다.
- `usage/logs`의 `user_id`/`project_id`는 스키마에 있지만 이름/제목으로 이어붙이지 않고 숫자
  그대로 보여준다(별도 조인 API가 없음).
