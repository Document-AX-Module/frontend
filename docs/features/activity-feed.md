# 활동 피드 (`ActivityFeed`)

`src/components/activity/ActivityFeed.tsx` — [대시보드](dashboard.md)와
[마이페이지](mypage.md)가 **공유**하는 컴포넌트. 목록이 비었을 때 무엇을 보여줄지는 호출부
책임이다. `relativeTime()`도 여기서 내보낸다.

행 구성: 액터 이니셜 아바타 · `{actor} · {action}` · 대상 · kind 배지 · 상대 시간.
`로그인`처럼 대상이 없는 활동은 `target`이 빈 문자열로 오므로 **그 줄을 렌더하지 않는다**.

## `kind`는 프론트가 열거해야 하는 집합이다

백엔드 `activity_logs` 테이블(마이그레이션 `1e199411435d`)에는 표시 문구가 아니라 **액션
코드**(`document.upload`, `analysis.start` …)가 들어가고, 문구와 배지 `kind`는 읽을 때
`activity_service.describe()`가 만든다. 그래서 `kind`는 열거형이다 —
`ACTION_LABELS` + `ANALYSIS_LABELS` + 폴백 2개 = **13개**:

```
로그인 · 프로젝트 · 폴더 · 문서 · 삭제 · 업로드 · 버전 · 오타 · 분류 · 규정 · 추천 · 분석 · 기타
```

`버전` = `document.version_add`(맞춤법 검사기의 "새 문서로 저장"이 원본→수정본을 V1→V2로
인서트할 때, 수정본 쪽 버전 추가에서 남는다) — [proofread.md](proofread.md) 참고.

`문서`는 `document.move`/`document.folder_change`(프로젝트 권한 기능의 문서 이동)가 쓴다 —
`project.visibility_change`/`project.member_invite`/`project.member_remove`는 새 액션이지만
기존 `프로젝트` kind를 그대로 재사용한다.

`분석` = 모르는 `analysis_type` 폴백, `기타` = 미등록 액션 코드 폴백.
**백엔드에 액션 코드를 추가하면 `KIND_TONE`도 같이 늘린다.**

`규정`/`분류`/`추천`은 해당 AI 모듈이 붙어야 실제로 나온다. `analysis.start`/`complete`/`fail`이
각각 로그로 남으므로 한 번 실행에 피드 항목이 2건 생긴다(시작 + 완료).

## 배지 색은 kind별이 아니라 클래스별 4톤

12색은 사람이 구분하지 못하고, 배지 텍스트가 이미 kind를 말하므로 **색은 분류만 나른다.**
`KIND_TONE`은 활동 분류이고 파이프라인 단계가 아니므로 `statusTone`과 **별도 맵**으로 유지한다.

| tone | 색 | kind |
|---|---|---|
| `destructive` | 브랜드 레드 `#b01c2e` | `삭제` |
| `analysis` | violet `#6d28d9` | `오타` `규정` `분류` `추천` `분석` |
| `change` | sky `#0369a1` | `업로드` `버전` `프로젝트` `폴더` `문서` |
| `quiet` | 중립 | `로그인` `기타` |

피드는 kind가 임의 순서로 섞이므로 인접쌍이 아니라 **전체 쌍**으로 검증했다(위 3색 전 항목
PASS). **amber는 탈락** — 브랜드 레드와 ΔE 10.6으로 정상 시야 하한 15 미만이라 `삭제` 톤과 같은
피드에 둘 수 없다.

## 문서 링크 규칙 — `canLinkToDocument()`

```ts
targetType === "document" && targetId != null && targetAlive
```

두 절 모두 load-bearing이다.

- **`targetType`** — id가 테이블별로 매겨지므로 `project` 행의 `targetId`가 무관한 *문서* id와
  겹친다. 404가 아니라 **200으로 엉뚱한 파일이 열리는 조용한 오동작**이라 404보다 나쁘다.
- **`targetAlive`** — 로그가 대상보다 오래 살아남으므로 `업로드`/`오타` 행도 대상이 나중에
  삭제됐으면 404다. `targetId`는 삭제 후에도 유지된다(감사 로그에서 "삭제된 문서 8"과 "대상
  없음"은 다른 사실이다).
- **`kind` 검사는 의도적으로 두지 않는다** — `kind`는 표시용 한글 문구라서 문구가 바뀌면 조용히
  깨진다. `targetAlive`가 삭제된 대상 전체를 이미 덮는다.

실제 로그 22행으로 측정한 규칙별 실패 양상:

| 규칙 | 링크 | 정상 | 404 | **엉뚱한 문서로 이동(200)** |
|---|---|---|---|---|
| `kind !== "삭제"` 만 | 13 | 2 | 6 | **5** |
| `targetType` + `targetAlive` | 2 | 2 | **0** | **0** |

**닫을 수 없는 구멍**: `targetAlive`는 응답 생성 시점의 스냅샷이라, 렌더와 클릭 사이에 다른
사용자가 지우면 여전히 404다(재현 확인). 서버가 원천 차단할 수 없으므로 `DocumentDetail`의
"문서를 찾을 수 없습니다" 배너를 백스톱으로 유지한다.
