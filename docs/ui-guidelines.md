# UI 규칙 (토큰 · 공용 컴포넌트 · 색)

브랜드는 **PCN**: 베이스 화이트 · 블랙 잉크 · 딥레드 강조.

## 디자인 토큰 (`src/app/globals.css`)

Tailwind v4 `@theme`에 선언한다. **컴포넌트에서 임의의 hex를 쓰지 않고 토큰 유틸리티를 쓴다**
(`bg-primary`, `text-ink-muted`, `border-border`…).

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-canvas` | `#ffffff` | 페이지/카드 바닥 |
| `--color-surface` | `#f6f6f7` | 한 단 들어간 면, hover |
| `--color-surface-2` | `#efeff1` | 중립 배지 배경 |
| `--color-border` | `#e5e5e8` | 모든 경계선 |
| `--color-ink` | `#191919` | 본문 |
| `--color-ink-muted` | `#6b6b73` | 보조 텍스트 |
| `--color-primary` | `#b01c2e` | 브랜드 레드 (강조 + 파괴적 동작) |
| `--color-primary-hover` | `#8f1626` | |
| `--color-primary-soft` | `#fbeaec` | 레드 배지 배경 |

**모서리 반경은 스케일로 고정**한다 — 컴포넌트마다 새로 정하지 않는다:

- `rounded-panel` (`0.75rem`) — 카드, 모달, 배너 등 콘텐츠를 담는 면
- `rounded-control` (`0.5rem`) — 버튼, 인풋, 내비 행, 아이콘 타일 등 클릭 가능한 요소
- 배지·태그·아바타는 고정 반경 대신 `rounded-full`

전역 규칙 두 개도 `globals.css`에 있다:

- `.tnum` (`font-variant-numeric: tabular-nums`) — **폴링되는 숫자에 필수**. 대시보드가 15초마다
  카운터를 갱신하는데 비례폭 숫자는 렌더마다 너비가 바뀌어 reflow가 튄다.
- `prefers-reduced-motion: reduce`에서 모든 애니메이션/트랜지션을 전역으로 죽인다. Tailwind의
  `animate-pulse`(스켈레톤)와 `transition-*`는 개별로 끌 수 없어서 OS 설정으로 일괄 차단한다.

## 공용 컴포넌트 (`src/components/ui/`)

새 UI를 만들기 전에 여기 있는지 먼저 본다.

### `primitives.tsx`

- 레이아웃: `PageHeader`, `Card`, `CardHeader`, `CardTitle`, `SectionTitle`, `BackLink`
- 입력: `Button`(`primary`|`outline`|`ghost`|`dark`) / `buttonClass`, `Field`, `Input`,
  `Textarea`, `Select`
- 표시: `StatusBadge`, `statusLabel`, `statusTone`, `TONE_STYLES`, `Tag`, `ErrorBanner`
- `FOCUS_RING` — 포커스 링 유틸 문자열. 커스텀 클릭 요소(타일, 메뉴 항목, 아바타 버튼)에 붙인다.
- `PageHeader`의 배지는 `titleBadge`로 넘겨 제목 옆에 붙인다. `actions`는 버튼 줄이므로 배지를
  섞으면 버튼처럼 보여 눌러도 반응이 없는 것처럼 읽힌다.
- **`STATUS_STYLES`가 한글 상태 라벨의 유일한 출처**다. `statusLabel()`로 읽고 맵을 다시 선언하지
  않는다. 파이프라인 단계 tone(`idle`/`active`/`done`/`fail`)은 `statusTone()`.

### `Modal.tsx`

**네이티브 다이얼로그를 쓰지 않는다.** `alert`/`confirm`/`prompt` 대신 `Modal` /
`ConfirmDialog` / `PromptDialog`.

### 타일 · 메뉴 · 파일 아이콘

- `IconTile.tsx` — `LinkIconTile`(URL로 이동), `ButtonIconTile`(동작). hover/focus-within에서만
  테두리와 케밥 메뉴가 드러난다.
- `IconMenu.tsx` — 타일/행 우상단의 케밥(⋯) 드롭다운. 바깥 클릭·`Escape`로 닫히고
  `role="menu"`를 쓴다. `Topbar` 계정 메뉴 패턴을 일반화한 것이다.
- `icons/FileTypeIcon.tsx` — 확장자 → 카테고리(`pdf/word/excel/ppt/hwp/image/text/generic`)
  매핑과 `FileTypeIcon`, `FolderTileIcon`. `extOf`, `categoryOfExt`, `categoryOfFileName`,
  `fileTypeMeta`도 여기서 가져온다.

## 색 정책

세 곳의 색 규칙이 서로 다르므로 섞지 않는다.

1. **차트** (`src/components/charts/`) — 의존성 없는 인라인 SVG, **브랜드 레드 단색조**.
   범주형 팔레트가 없으므로 색맹 검증이 필요 없다. `Sparkline`, `AreaTrend`, `BarList`,
   `PipelineStrip`.
2. **활동 배지** — kind별이 아니라 **클래스별 4톤**. 근거와 검증 결과는
   [features/activity-feed.md](features/activity-feed.md).
3. **파일 타입 아이콘** — 카테고리별 8색이지만 관례색(PDF 빨강, DOC 파랑, XLS 초록…)이고
   아이콘 안에 `PDF`/`DOC` 같은 **텍스트 라벨이 같이 들어가** 색이 유일한 채널이 아니다.
   상태를 뜻하지 않으므로 `StatusBadge` 톤과 의미가 겹치지 않는다.

새로 색을 추가할 때: 같은 화면에 동시에 나올 수 있는 색끼리는 **전체 쌍**으로 대비를 확인한다.
피드처럼 순서가 임의로 섞이는 목록에서는 인접쌍만 보면 부족하다.
