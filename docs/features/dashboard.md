# 대시보드 (`/`)

`DashboardView` (`src/components/dashboard/`). 엔드포인트 계약은
[api-spec.md §5](../api-spec.md), 활동 피드는 [activity-feed.md](activity-feed.md).

## 데이터 로드

세 요청을 **`Promise.all`로 한 번에** 던진다:

| 요청 | 클라이언트 | 쓰임 |
|---|---|---|
| `GET /dashboard/summary` | `dashboard.ts` | 스탯 타일 · 주간 추이 · 타입 분포 · 파이프라인 |
| `GET /activity` | `dashboard.ts` | 최근 활동 |
| `GET /documents/recent` | **`documents.ts`** (`listRecentDocuments`) | 최근 문서 카드 |

`/documents/recent`가 `documents.ts`에 있는 이유는 경로 도메인이 documents라서다. 집계가 아니라
목록이고 `limit`을 독립적으로 받으므로 `summary`에 합치지 않는다.

- **폴링**: `stats.processing > 0`인 동안만 15초 간격 재조회(`POLL_MS`). 파이프라인 카드의
  "실시간" 표기 근거가 이것이다.
- **조용한 갱신**: 폴링은 `load({ quiet: true })`로 돌고, 첫 렌더 이후의 실패는 이미 표시된
  수치를 지우지 않는다(`error && summary`일 때만 배너).
- `authLoading`이 끝난 뒤에 로드한다 → [auth.md](../auth.md).

## 백엔드가 클라이언트에 넘긴 파생값

백엔드가 **의도적으로** 남긴 세 가지다. 서버가 주는 값이라고 착각해서 중복 구현하지 않는다.

1. **`weeklyProcessing` 축 라벨** — 값은 **UTC** 기준 최근 7일이고 마지막 원소가 오늘이다.
   요일이 고정이 아니므로 `weekdayLabels()`가 오늘 날짜로 계산하는데, **이것도 UTC로 계산해야
   한다** — 로컬 기준으로 하면 KST 오전에 마지막 칸이 "오늘"이 아니게 된다.
2. **`pipeline[].status` → 한글 라벨** — 원값이 `DocStatus`이므로 `statusLabel()`/`statusTone()`
   으로 변환한다(`STATUS_STYLES` 재사용, 중복 정의 금지).
3. **`at` → 상대 시간** — ISO8601을 "10분 전"으로 만드는 건 프론트다. `relativeTime()`은
   `ActivityFeed`에서 가져와 최근 문서 카드도 같이 쓴다.

## 카드 구성

- **스탯 타일 4개** — 프로젝트 / 문서 / 처리 중 / 오늘 RAG 질의.
  - `stats.ragToday`는 항상 **하드 0**(RAG는 MVP2)이라 타일에 `RAG 미구현` 배지를 붙여 실측처럼
    보이지 않게 한다.
  - **증감 배지·스파크라인 없음** — 과거 시점 데이터 소스가 없다. 주간 추이는 `AreaTrend`가
    담당한다.
  - 숫자에는 `.tnum`을 붙인다(15초마다 갱신되므로 폭이 흔들리면 안 된다).
- **인사말 헤더** — 처리 중 건수가 있으면 그것을, 없으면 총 문서 수를 문장으로 말한다.
  `tracking-tight`를 뺐다: 한글은 자간을 좁히면 가독성이 떨어진다.
- **주간 추이** `AreaTrend` · **타입 분포** `BarList` · **파이프라인** `PipelineStrip`.
  - `pipeline`은 0건 단계도 8개 전부 고정 순서로 내려오므로 칸 수가 흔들리지 않는다. 단
    `FAILED`는 0건이면 감춘다.
  - 0건 단계의 tone은 `idle`로 눕힌다.
- **최근 문서** — `RecentDocumentRead`는 **snake_case**다. `project_name` +
  `processing_status`(현재 버전 기준, 버전 없으면 `UPLOADED`)가 납작하게 펼쳐져 오므로 문서별
  추가 조회 없이 프로젝트 경로와 `StatusBadge`를 바로 그린다.
- **최근 활동** — `ActivityFeed` 공용 컴포넌트. 빈 상태 문구는 호출부 책임이다.

## ⚠️ 프로젝트 스코프 대시보드를 만들 때

`project_id` 처리가 엔드포인트마다 다르다. 없는 프로젝트를 주면 `/documents/recent`는 **404**,
`/dashboard/summary`는 **200**(빈 집계)이다. 지금은 `project_id`를 안 보내지만, 보내기 시작하면
`Promise.all` 하나가 404로 전체를 실패시킨다.
