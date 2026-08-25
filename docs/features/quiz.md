# 퀴즈 (`/quiz`)

문서에서 만든 문항을 모아 두는 **문제은행**, 그걸 골라 구성한 **문제집**, 그리고 **응시·채점**.
엔드포인트 표는 [../api-spec.md](../api-spec.md) §10, 백엔드 원본은 `app/api/v1/quiz.py` ·
`app/schemas/quiz.py`.

문제는 직접 작성하거나, 문제은행에서 골라 넣거나, **AI로 생성**한다. AI 생성은 검색(질의→
top-k)이 아니라 **커버리지** 방식이다 — topic을 받지 않고 지정한 문서의 청크를 등장 순서대로
전부 훑어 배치로 나눠 출제한다. 그래서 문서 앞·중간·뒤가 골고루 다뤄지고, 임베딩이 없는
문서(`CHUNKED` 상태)에서도 동작한다. 202 + 폴링 비동기 작업이라 진행 상황은
`GenerateQuestionsModal`이 2초 간격으로 폴링해서 보여준다.

## 파일

| 경로 | 역할 |
|---|---|
| `src/lib/quiz.ts` | 19개 엔드포인트 + `isQuizLockedError` / `QUIZ_LOCKED_MESSAGE` |
| `src/app/quiz/layout.tsx` | 하위 4개 메뉴를 `QuizProjectProvider`로 감싼다 |
| `components/quiz/QuizProjectProvider.tsx` | 프로젝트 조회 조건 컨텍스트 + `QuizProjectFilter` + `QuizProjectGate` |
| `components/quiz/QuizPageShell.tsx` | 4개 메뉴가 공유하는 폭 컨테이너 |
| `components/quiz/QuizBooksView.tsx` | `/quiz` 문제집 목록 · 복제 · 삭제 |
| `components/quiz/QuizBookCreateView.tsx` | `/quiz/new` 문제집 만들기 (전용 페이지) |
| `components/quiz/QuestionBankView.tsx` | `/quiz/bank` 문제은행 목록 · 필터 · 문제집 편입 · AI 생성 진입점 |
| `components/quiz/QuestionEditorView.tsx` | `/quiz/bank/new` · `/quiz/bank/[questionId]` 문제 작성/수정 (전용 페이지) |
| `components/quiz/QuizBookDetail.tsx` | `/quiz/[id]` 문제·설정·응시 결과 탭 (문제 탭에 AI 생성 진입점) |
| `components/quiz/GenerateQuestionsModal.tsx` | AI 문제 생성 모달 — 문서 선택 → 202 시작 → 폴링 → 결과 |
| `components/quiz/QuizTake.tsx` | `/quiz/[id]/take` 모드 선택 → 서버 세션 응시 |
| `components/quiz/QuizResult.tsx` | `/quiz/[id]/result` 점수 · 정답률 · 오답노트 |
| `components/quiz/QuizTakePicker.tsx` | `/quiz/take` 응시할 문제집 선택 |
| `components/quiz/QuizResultsOverview.tsx` | `/quiz/results` 내 응시 이력 |
| `components/quiz/QuizFields.tsx` | 설정 토글 · 잠금 안내/배너 |
| `components/quiz/quizFormat.ts` | 날짜·점수·답 표시 헬퍼 |

enum(`QuizDifficulty` / `QuizQuestionType` / `QuizReviewStatus` …)은 `src/lib/types.ts`가 소유하고,
라벨·배지는 `primitives.tsx`가 가진다 (`DocStatus`와 같은 구조).

## 폼은 페이지, 확인·선택은 모달

문제집 만들기(설정 8개 + 문서 목록)와 문제 작성(유형·보기 4개·해설·태그·출처·검수)은 필드가 많아
모달에 넣으면 **모달 스크롤 안에 목록 스크롤이 또 생긴다**. 그래서 이 둘만 전용 페이지로 뺐다.
모달로 남은 것은 스크롤 영역이 하나인 것들뿐이다:

- `ConfirmDialog` — 삭제/제외/제출 확인
- 문제집 상세의 "문제은행에서 추가", 문제은행의 "선택한 문제 문제집에 추가" — 단순 목록 선택기

문제집 상세의 "직접 작성"은 `/quiz/bank/new?book=<id>`로 간다. 저장하면 문제은행에 등록한 뒤
그 문제집에 편입하고 문제집 상세로 돌아온다. 문제 수정도 같은 방식(`?book=`)으로 돌아갈 곳을
전달한다.

수정 화면은 **단일 문제 조회 엔드포인트가 없어** 목록(`listQuestions` 또는 `listBookQuestions`)을
받아 id로 찾는다.

## 프로젝트는 "조회 조건"

퀴즈 API는 전부 프로젝트 스코프인데 `/quiz/*` 라우트에는 프로젝트가 없다. 프로젝트를 **먼저
골라야 하는 것이 아니라 조회 조건**으로 다룬다: 기본값이 "전체 프로젝트"이고, 하나를 고르면
그 프로젝트만 보인다.

- `src/app/quiz/layout.tsx`의 `QuizProjectProvider`가 `listProjects()`를 한 번 부르고,
  선택값을 `localStorage["ax.quiz.projectId"]`에 남긴다 (`""` = 전체).
- 조회 대상은 `useQuizProject().scopeIds` — 전체면 참여 중인 모든 프로젝트 id다. `useMemo`로
  참조가 안정적이라 effect 의존성에 그대로 쓸 수 있다.
- **전체 조회 전용 엔드포인트가 없어** 프로젝트마다 병렬로 부르고(`Promise.all`) 합친 뒤
  `created_at` 역순으로 정렬한다. 전체일 때는 카드/행에 프로젝트 이름을 함께 보여준다.
- `<QuizProjectGate>`는 `authLoading` 대기 · 미로그인 · 프로젝트 없음만 처리한다 (프로젝트
  선택을 강제하지 않으므로 render prop이 아니라 그냥 children).
- **생성 폼은 프로젝트를 반드시 하나 지정해야 한다** — 필터가 "전체"면 첫 프로젝트를 기본값으로
  두고, 폼 안에 프로젝트 `Select`를 둔다 (`/quiz/new`, `/quiz/bank/new`).
- 문항은 **자기 프로젝트의 문제집에만** 편입된다. 전체 조회 중 여러 프로젝트의 문항을 함께
  선택하면 "선택한 문제 문제집에 추가"를 비활성화한다.
- **문제집 상세/응시/결과는 필터와 무관하다** — `QuizBookRead.project_id`가 있어 문제집 자체에서
  프로젝트를 얻고, URL만으로 동작한다.

### 필터 레이아웃 함정

`Select`/`Input`은 `INPUT_BASE`에 `w-full`을 갖고 있고, **Tailwind는 class 속성 순서가 아니라
생성된 CSS 순서로 우선순위를 정한다.** 그래서 `<Select className="w-auto">`는 먹지 않고 필터가
하나씩 줄을 다 차지한다. 폭은 **바깥 컨테이너로** 제어할 것:

- 문제은행: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` — 검색 `Input`은 `col-span-full`로
  자기 줄, 조건 5개가 다음 줄에 나란히.
- 목록 화면들: `QuizProjectFilter`가 기본 `w-56` 래퍼를 갖는다 (`className`으로 덮을 수 있고,
  그리드 셀 안에서는 `w-full`).

## AI 문제 생성

`GenerateQuestionsModal`이 `QuestionBankView`(`/quiz/bank`)와 `QuizBookDetail`의 문제 탭
(`/quiz/[id]`) 양쪽에서 열린다. 두 진입점의 차이는 `fixedBook` prop 하나다:

- **문제은행에서 열 때** — `fixedBook` 없음. 프로젝트가 둘 이상이면 모달 안에 프로젝트
  `Dropdown`을 두고(문제집 생성 폼과 같은 패턴), 자동 편입할 문제집은 선택 사항이다
  (`quiz_book_id`를 안 보내면 문제은행에만 쌓인다). 편입 후보는 `has_sessions === true`인
  문제집을 미리 걸러서 보여준다.
- **문제집 상세에서 열 때** — `fixedBook={{ id, title, project_id }}`. 프로젝트와 편입
  문제집이 그 문제집으로 고정되고, 잠긴 문제집(`has_sessions`)이면 버튼 자체가 비활성화된다.

흐름: `POST .../quiz-questions/generate`가 `status=RUNNING`인 `QuizGenerationJob`을 202로
돌려주면, 모달이 `POLL_INTERVAL_MS`(2초) 간격으로 `GET /quiz-generation-jobs/{id}`를 불러
`created_count / requested_count`를 진행률 바로 보여준다. `COMPLETED`/`FAILED`에서 멈춘다.

주의할 것 세 가지:

- **질의(topic)가 없다.** 검색이 아니라 커버리지 방식이라 문서만 고른다 — 문서의 청크를
  등장 순서대로 훑어 배치로 나눠 출제하므로 임베딩 없는 문서(`CHUNKED`)에서도 동작한다.
- **`COMPLETED`인데 `error`가 채워져 있으면 "부분 성공"이다.** 요청한 `count`보다 적게
  만들어졌다는 뜻(중복 제외, 일부 배치 실패)이라 실패로 취급하지 않고 `created_count`와
  함께 사유를 그대로 보여준다.
- **409가 두 가지 다른 의미를 가진다** — 대상 문서에 청크가 없음(파싱/청킹 전) 또는
  편입하려는 문제집에 응시 이력이 있음. 다른 세 엔드포인트처럼 `isQuizLockedError`로
  뭉뚱그리지 않고 `errorMessage(e, ...)`로 서버 메시지를 그대로 보여준다.
- 모달을 닫아도(`RUNNING` 중이라도) 생성 자체는 서버 백그라운드 작업이라 계속된다 — 닫기
  버튼 라벨로 그 사실을 알린다. 다시 목록에서 확인하려면 새로고침하면 된다.

## 잠금 정책 (가장 중요)

**응시 이력이 하나라도 생긴 문제집은 설정과 문제 구성을 고칠 수 없다.** 모든 응시자가 같은 버전을
보게 하는 공정성 규칙이다. `QuizBookRead.has_sessions`로 판단한다.

409를 내는 엔드포인트는 셋뿐이다:

```
PATCH  /quizzes/{id}
POST   /quizzes/{id}/questions
DELETE /quizzes/{id}/questions/{qid}
```

프론트 처리:

- `has_sessions === true`면 설정 폼 입력과 "직접 작성" / "문제은행에서 추가" / "문제집에서 제외"를
  **미리 비활성화**하고, `LockedBanner`로 **"복제해서 편집"**(`POST /quizzes/{id}/duplicate`)을
  안내한다. 복제본은 세션이 없어 자유롭게 수정된다.
- **그래도 409는 처리한다.** 조회와 수정 사이에 다른 사용자가 응시를 시작할 수 있다. 세 곳 모두
  `isQuizLockedError(e)`로 잡아 `QUIZ_LOCKED_MESSAGE`를 보여준다.
- 잠금과 **무관한** 것 두 가지를 헷갈리지 말 것:
  - `DELETE /quizzes/{id}` (문제집 삭제) — 항상 허용. 대신 세션·답변도 cascade 삭제된다.
  - `PATCH /quiz-questions/{id}` (문항 내용 수정) — 문제은행 쪽 작업이라 409가 없다. 그래서
    잠긴 문제집에서도 "문제 수정" 메뉴는 열려 있다.

## 응시 흐름

서버 세션 기반이라 목업 시절과 흐름이 다르다.

1. **시작 화면** — 모드(`study` / `exam`)를 먼저 고른다. 모드는 세션 생성 시점에 서버에 고정되므로
   응시 중에 바꿀 수 없다.
2. `POST /quizzes/{id}/sessions` → `session_id` + **정답이 빠진** 문항 목록(`QuizQuestionPlay`).
   `shuffle_questions`는 백엔드가 처리한다.
3. `study` 모드는 답할 때마다 `.../answers`를 불러 `is_correct`/정답/해설을 즉시 보여주고, 그
   문항은 다시 못 고친다(서버에 이미 기록됨). `exam` 모드는 답을 로컬에 들고 있는다.
4. `.../submit` → 점수·정답수 집계 + 오답노트. 이후 `?session={id}`를 붙여 결과 화면으로 이동.

주의할 세 가지:

- **`shuffle_options`는 백엔드가 섞지 않는다** — 정답이 `options` 인덱스라 섞으면 매핑이 꼬인다.
  `QuizTake`의 `displayOrder`가 표시 순서만 섞고, 제출은 항상 **원본 인덱스**로 한다.
- **제출할 때 모든 문항을 보낸다.** 서버는 실제로 기록된 답변 수로 `total_count`를 계산한다.
  무응답을 빼고 보내면 분모에서 빠져 점수가 부풀려지므로 `""`로 채워 보낸다(서버는 오답 처리).
- **`time_limit_minutes`는 nullable** — null이면 타이머를 띄우지 않는다. 값이 있으면 0에서
  자동 제출한다.

## 결과 · 오답노트

`QuizAnswerRecord`는 제출 시점 스냅샷(`question_text`/`options`/`correct_answer`/`explanation`)이라
원본 문항이 삭제돼도 남는다. 그 경우 `question_id`가 null이다.

- `reveal_answers=false`인 문제집은 `correct_answer`/`explanation`이 null로 내려온다 → 정답 칸을
  숨기고 안내 문구를 띄운다.
- 난이도·분야별 정답률은 레코드에 없는 정보라 `listBookQuestions`로 받아 `question_id`로 이어
  붙인다. 삭제된 문항은 집계에서 빠진다.
- `GET /quizzes/{id}/sessions`는 **전체 사용자** 요약이지만 세션 상세는 **본인 것만** 조회된다 →
  문제집 결과 탭에서 남의 행은 링크로 만들지 않고 "내 응시" 배지로 구분한다.

## 알려진 거친 부분

- **전체 조회가 프로젝트 수만큼 요청을 낸다.** 프로젝트 통합 엔드포인트가 없어서다. 백엔드에
  `/documents/recent?project_id=`처럼 **project_id를 옵션으로 받는** 목록 엔드포인트
  (`GET /quizzes`, `/quiz-questions`, `/quiz-sessions`)가 추가되면 프론트는 호출 1번으로 줄고,
  각 화면의 `Promise.all(scopeIds.map(...))`을 단일 호출로 바꾸면 된다.
- **문제집 목록에 문항 수가 없다.** `QuizBookRead`에 개수 필드가 없어 카드의 "N문제"는 문제집마다
  `/questions`를 한 번씩 더 부른다(N+1) — 전체 조회에서는 이게 위의 프로젝트 fan-out보다 비싸다.
  `QuizBookRead.question_count`를 백엔드에 추가하는 게 가장 효과가 크다.
- **`allow_retake`를 서버가 강제하지 않는다.** `start_session`에 검사가 없어 프론트는 시작 화면에
  안내만 띄우고 응시는 막지 않는다.
