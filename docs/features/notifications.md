# 알림 · Web Push · PWA

엔드포인트 표는 [api-spec.md §7·§8](../api-spec.md). 인앱 알림함(벨)과 Web Push는 **별개의 경로**다 —
푸시를 거부하거나 지원하지 않는 브라우저에서도 벨에는 알림이 그대로 쌓인다.

| 파일 | 역할 |
|---|---|
| `src/lib/notifications.ts` | 알림함 API 클라이언트 |
| `src/lib/push.ts` | SW 등록 + 구독 등록/해제 + 앱 아이콘 뱃지 |
| `src/components/notifications/NotificationBell.tsx` | Topbar 벨 + 드롭다운 + 폴링 |
| `src/components/notifications/PushToggle.tsx` | `/mypage`의 기기별 푸시 토글 |
| `public/sw.js` | 푸시 수신 · 알림 클릭 라우팅 · 열린 탭에 postMessage |
| `src/app/manifest.ts` | PWA 매니페스트 (`display: standalone`, 192/512 아이콘) |

## 벨 (`NotificationBell`)

**백엔드에 SSE/WebSocket이 없어서 폴링이다.** 세 가지 트리거로 미읽음 수를 갱신한다:

1. **60초 주기** — `setInterval`. 목록이 아니라 `/notifications/unread-count`만 호출한다.
2. **`window` focus** — 다른 탭에 있다가 돌아오면 즉시 1회.
3. **서비스워커 `postMessage`** — 푸시가 도착한 순간. 앱이 열려 있어도 뱃지가 즉시 맞는다.
   드롭다운이 열려 있으면 목록까지 다시 읽는다(열림 여부는 `openRef`로 보므로 리스너를
   재등록하지 않는다).

폴링 실패는 **화면에 에러를 띄우지 않는다**(다음 주기에 다시 시도). 드롭다운을 직접 열었을 때의
실패만 배너로 보여준다. 다른 데이터 컴포넌트와 같이 `authLoading`이 끝나고 `user`가 있을 때만
호출한다.

- 뱃지 숫자는 응답의 `unread`(전체 미읽음 수)다 — `items.length`가 아니다. 100건 이상은 `99+`.
- 항목 클릭 → **낙관적으로** 읽음 표시 + 뱃지 감소 → `POST /notifications/{id}/read` → 이동.
  이동하면서 드롭다운이 사라지므로 서버 응답을 기다리지 않고, 성공/실패 모두 뒤이어
  `unread-count`로 정정한다.
- `url`은 프론트 경로 그대로 쓴다. **초대 알림만 예외**: `project.invite`의 `url`은
  `/projects/{id}`인데 수락 전에는 403이라 `/projects`(초대 카드가 있는 곳)로 돌린다 →
  `targetHref()`.
- 알림 종류 10종의 한글 라벨은 `notificationTypeLabel()`/`NotificationTypeBadge`
  (`primitives.tsx`)가 유일한 출처다. 모르는 `type`이 와도 원문을 그대로 배지에 그린다 —
  활동 피드의 `kind`와 같은 정책([activity-feed.md](activity-feed.md)). 뱃지는 타입별 톤 구분
  없이 무채색 하나로 통일한다(색으로 구분할 만큼 정보 가치가 없어서).
- 전용 알림 페이지는 없다. 드롭다운이 최근 20건만 보여주고 `offset` 페이지네이션은 아직 안 쓴다.

## Web Push

### 왜 직접 구현했나

**Turbopack에서 `next-pwa`를 쓸 수 없다** — 그래서 매니페스트(`app/manifest.ts`)와
서비스워커(`public/sw.js`)를 손으로 관리한다. 오프라인 프리캐시는 하지 않는다(푸시 수신 + 알림
클릭 라우팅만). SW는 `public/`에 있으므로 그대로 `/sw.js`로 서빙되고 scope는 `/`다.

### 보안 컨텍스트 제약

푸시는 secure context 전용이다. `localhost`는 예외로 secure지만 **LAN IP(`http://192.168.0.32`)는
아니다** — 휴대폰 실기기 테스트는 HTTPS나 터널이 필요하다. `push.ts`의 `isSecureForPush()`가 이걸
확인하고, `PushToggle`은 버튼 대신 이유를 문장으로 보여준다(`insecure` 상태).

### 서비스워커는 토큰을 다루지 않는다

구독 등록/해제는 **메인 스레드**(`push.ts`)가 Bearer 토큰을 붙여 처리한다. SW는 인증이 필요한 API를
호출하지 않으므로 access token을 알 필요가 없다.

### payload 계약

백엔드(`push_service.py`)가 보내는 JSON은 `{title, body, url, type}` **4개 키로 고정**이다.
`sw.js`는 이걸

- `tag: type` — 같은 종류의 알림이 트레이에 쌓이지 않게 최신 것만 남긴다,
- `data: {url, type}` — `notificationclick`에서 이동 경로로,
- `clients.matchAll()` → `postMessage({type: "notification"})` — 열린 탭의 벨 갱신

에 쓴다. `notificationclick`은 **이미 열린 탭이 있으면 `focus()` + `navigate()`** 하고, 없으면
`openWindow()`로 새로 연다.

### 구독 상태 (`PushState`)

`getPushState()`가 5가지 중 하나를 준다: `unsupported`(SW/PushManager/Notification 없음) ·
`insecure` · `denied`(브라우저가 차단) · `subscribed` · `unsubscribed`. 앞의 셋은 토글 버튼을 아예
그리지 않고 이유만 보여준다 — 버튼이 없는 게 버그로 보이지 않게 한다.

**구독은 브라우저+기기 단위**라 다른 기기에서 켠 것과 무관하다. 마이페이지 문구도 "이 기기에서"로
쓴다. iOS는 홈 화면에 설치한 뒤에만 지원한다.

해제는 **서버를 먼저 정리**한다(`DELETE /push/subscribe` → `subscription.unsubscribe()`). 순서를
바꾸면 브라우저 구독만 사라지고 백엔드가 죽은 endpoint로 계속 발송한다.

### 앱 아이콘 뱃지

`setAppBadge(unread)`(`push.ts`)가 `navigator.setAppBadge`/`clearAppBadge`를 옵셔널로 호출한다.
설치형(standalone)에서만 눈에 보이고, 미지원 브라우저에서는 조용히 무시된다.

## PWA

`app/manifest.ts`가 `/manifest.webmanifest`로 빌드되고 Next가 `<link rel="manifest">`를 자동으로
넣는다. 아이콘은 `public/icon-192.png` · `public/icon-512.png`(`pcn-logo.png`를 리사이즈한 것,
512는 `maskable`로도 등록). `theme_color`는 `globals.css`의 `--color-primary`와 같은 값이고
`app/layout.tsx`의 `export const viewport`에도 **리터럴로 중복**된다 — 매니페스트/메타데이터는 CSS
변수를 읽을 수 없다. 색을 바꿀 때 세 곳을 함께 바꿀 것.

## 알림이 생기는 지점

백엔드가 알림을 만드는 곳이라 프론트가 직접 호출하는 API는 없지만, 어떤 행동이 상대에게
무엇을 보내는지는 알아둘 것 ([projects-documents.md](projects-documents.md)의 초대 흐름과 짝):

| 알림 `type` | 언제 | 받는 사람 |
|---|---|---|
| `project.invite` | owner가 초대 | 초대받은 사람 |
| `project.invite_accepted` | 초대 수락 | 초대한 owner |
| `project.invite_declined` | 초대 거절 | 초대한 owner |
| `project.member_removed` | **정식 멤버**를 제거 (초대 취소는 알리지 않는다) | 제거된 사람 |
| `analysis.complete` / `analysis.fail` | AI 분석 종료 | 실행한 사람 |
| `text_proofread.complete` / `text_proofread.fail` | 맞춤법 검사 종료 | 실행한 사람 |
| `quiz_generate.complete` / `quiz_generate.fail` | AI 문제 생성 종료 | 실행한 사람 |
