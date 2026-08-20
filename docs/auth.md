# 인증 (백엔드 소유 JWT)

OAuth2 플로우는 **백엔드가 돌린다**(`google` + 개발용 `mock` 프로바이더). 백엔드가 짧은 수명의
**access JWT**(프론트는 `api.ts` 메모리에만 보관)와 **`refresh_token` httpOnly 쿠키**(백엔드
오리진 소유)를 발급한다. 엔드포인트 표는 [api-spec.md §1](api-spec.md).

## 세션 부트스트랩

`AuthProvider` (`src/components/auth/`)가 마운트 시:

1. `POST /auth/token/refresh` (쿠키로) → access token을 `setAccessToken()`으로 메모리에 저장
2. `getMe()` → `{ id, email, name, role }`

`/me`에는 아바타가 없어서 `initialsOf()`가 이름/이메일에서 이니셜을 파생한다.

부트스트랩은 **반드시 끝난다**. 아래 세 겹이 그걸 보장하는데, `loading`이 true로 남으면 아래
게이팅 규칙 때문에 앱 전체가 스켈레톤에 갇혀 에러조차 못 띄우기 때문이다.

1. 두 요청 모두 `timeoutMs: 8000`으로 끊는다 (`bootstrapSession`).
2. 실패는 `bootstrapSession`이 삼켜 `user: null`을 돌려준다 (`AuthProvider`도 `.catch()`로 방어).
3. `AuthProvider`는 `.finally()`에서 `loading`을 풀고, 그래도 안 풀리면 10초 failsafe 타이머가 푼다.

이후 컴포넌트 fetch가 401이나 408을 받아 각자의 `ErrorBanner`를 띄우게 된다.

## 로그인 / 로그아웃

- `/login` → `getProviders()`로 프로바이더 버튼을 그림 → `loginWith(provider)`가 백엔드로 이동
  → 백엔드가 쿠키를 심고 `/auth/callback`(route handler)으로 리다이렉트 → 거기서 `/`로 바운스.
- 로그아웃은 `Topbar` 계정 메뉴 → `POST /auth/logout`.

## 라우트 보호는 클라이언트 사이드다

미들웨어가 아니다. refresh 쿠키가 **백엔드 오리진(`:8000`)** 소유라서 `:3000`의 Next 프록시가
볼 수 없기 때문이다. 그래서 이 리포에는 `proxy.ts`/미들웨어가 없다.

`AppChrome`이 미인증 사용자를 `/login`으로 보내는데, **`NEXT_PUBLIC_AUTH_ENABLED === "true"`
일 때만** 그렇게 한다(기본 off → 백엔드 없이 UI 열람 가능).

## ⚠️ 데이터 컴포넌트는 `authLoading`에 게이팅한다

`useAuth()`의 `loading`이 끝나기 전에 fetch를 던지면 새로고침이 토큰 재발급과 경쟁해서
**"로그인이 필요합니다"가 잘못 번쩍인다.** 새로 만드는 데이터 로딩 컴포넌트도 이 패턴을 따른다.

```tsx
const { loading: authLoading } = useAuth();

useEffect(() => {
  if (authLoading) return; // 토큰 재발급이 끝나기를 기다린다
  void load();
}, [authLoading, load]);
```

에러 표시는 `ErrorBanner`에 `needLogin={isAuthError(e)}`를 넘긴다 — 인증 에러(401/403)일 때만
로그인 링크가 붙는다.
