# 문서 비교 (버전 diff)

엔드포인트는 [api-spec.md §3](../api-spec.md). `AiPanel`의 `문서 비교` 탭.

## 흐름

1. 탭을 열면 `ComparePanel`(`AiPanel.tsx`)이 `listVersions(docId)`로 버전 목록을 불러와
   체크박스 목록으로 보여준다. 두 개를 고르면 "선택한 버전 비교" 버튼이 활성화된다.
2. 비교 순서는 **선택한 순서가 아니라 항상 `version_no` 오름차순**(이전 → 이후)으로 고정한다 —
   git diff 관례를 따른 것.
3. 버튼을 누르면 `DiffModal`이 열리고 `GET /documents/{id}/diff?from_version_id=&to_version_id=`를
   호출한다. 백엔드가 `difflib`로 **동기 계산**해 즉시 200을 준다(202/폴링 아님, GPT도 아님).

## 렌더링

응답(`DiffResult`)은 섹션 단위로 정렬돼 있다: `sections[]`의 각 항목이
`op`(`unchanged`/`added`/`deleted`/`modified`)와, 이어붙이면 원문이 재구성되는
`tokens[]`(`equal`/`insert`/`delete`)를 갖는다.

- `DiffModal`은 각 섹션을 좌(이전 버전) / 우(이후 버전) 2열로 그린다. `tokens`를
  `sideTokens()`로 필터링해 `equal`+`delete`는 왼쪽에, `equal`+`insert`는 오른쪽에 배치 —
  `added` 섹션은 왼쪽이, `deleted` 섹션은 오른쪽이 자동으로 빈 칸(`—`)이 된다.
- 두 열은 배경을 다르게 깔아(왼쪽 `bg-surface-2/30`, 오른쪽 `bg-canvas`) 같은 표처럼 헷갈리지
  않게 했고, 헤더에도 "이전 · V{n}" / "이후 · V{n}" 라벨 + 점 색상(빨강/초록)을 붙였다.
- 상단 요약 칩(추가/삭제/수정 — `변경 없음`은 정보 표시만, 토글 불가)을 눌러 활성 op를
  고르면, `↑`/`↓` 버튼이 그 op에 해당하는 섹션만 순서대로 스크롤+포커스 링(`ring-sky-400`)으로
  이동한다. 카운터(`n / total`)는 필터링된 개수 기준.
- 텍스트는 접거나 요약하지 않고 **전문을 그대로** 보여준다(요청사항 — "전문이 보이면서
  하이라이트"). 문서가 매우 길면 모달 안 스크롤 영역(`max-h-[65vh]`)만 스크롤된다.

## 알아둘 것

- 섹션 매칭은 `(level, section_type, 정규화된 제목/본문)` 튜플로 하므로, 제목이 크게 달라지면
  "수정"이 아니라 삭제+추가로 갈릴 수 있다(백엔드 `_MODIFY_RATIO_THRESHOLD=0.4`) — UI가 잘못된
  게 아니라 매칭 알고리즘의 특성이다.
- 버전이 2개 미만이면 비교 UI 대신 안내 문구만 보인다.
- 이 기능에 필요한 백엔드 엔드포인트는 이미 다 갖춰져 있다(`listVersions` + `/diff`) — 추가로
  요청할 API는 없다.
