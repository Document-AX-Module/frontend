# 마이페이지 (`/mypage`)

`src/app/mypage/page.tsx` + `src/lib/mypage.ts`. `Topbar` 계정 메뉴에서 들어간다(사이드바 내비
아님). 엔드포인트는 [api-spec.md §6](../api-spec.md).

## 데이터

`getMyPageSummary(activityLimit = 10)` → `GET /mypage/summary?activity_limit=`.
요청 하나로 프로필 + 집계 + 활동을 다 받는다.

```ts
type MyPageSummary = {
  profile: MyPageProfile;                        // id, email, name, role, provider, lastLoginAt, memberSince
  stats: { projects: number; documents: number; processing: number };
  recentActivity: ActivityItem[];
};
```

- **이 응답은 camelCase**다(`lastLoginAt`, `memberSince`, `recentActivity`) —
  `/dashboard/summary`, `/activity`와 함께 API의 camelCase 예외 3개 중 하나다.
- **스코핑 기준이 대시보드와 다르다.** 대시보드는 `project_id` 기준이고 마이페이지는 **로그인
  사용자**(`created_by`/`actor_id`) 기준이다. 그래서 `stats`의 이름도 "내 프로젝트 / 내 문서"다.
- `authLoading`이 끝난 뒤 로드한다. 첫 렌더 이후의 갱신 실패는 이미 표시된 정보를 지우지 않는다.

## 구성

- **프로필 카드** — `initialsOf(profile)` 아바타, 이름/이메일, 그리고 `<dl>` 4칸:
  권한(`role`) · 로그인 방식(`provider`) · 가입일(`memberSince`) · 최근 로그인(`lastLoginAt`).
  `lastLoginAt`은 nullable이라 `-`로 폴백한다. 카드 하단에 로그아웃 버튼(`useAuth().logout`).
- **집계 3칸** — 내 프로젝트 / 내 문서 / 처리 중. 숫자는 `.tnum` + `font-mono`.
- **푸시 알림** — `PushToggle`. 이 화면의 **유일한 쓰기 동작**이고 `/mypage/summary`와 무관하게
  브라우저 구독 상태만 다룬다. 구독은 브라우저+기기 단위라 문구도 "이 기기에서"로 쓴다.
  미지원/비보안 컨텍스트/권한 차단이면 버튼 대신 이유를 보여준다 →
  [notifications.md](notifications.md).
- **내 최근 활동** — [`ActivityFeed`](activity-feed.md) 공용 컴포넌트를 그대로 쓴다.
- 로딩은 실제 카드 높이에 맞춘 `MyPageSkeleton`(`aria-busy`)으로 대체한다.

푸시 토글을 빼면 **읽기 전용**이다. 프로필 편집을 붙이려면 백엔드에 수정 엔드포인트
(`PATCH /auth/me` 등)가 있는지부터 `/openapi.json`으로 확인한다.
