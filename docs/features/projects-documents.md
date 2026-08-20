# 프로젝트 · 문서

엔드포인트 표는 [api-spec.md §2·§3](../api-spec.md). 모두 로그인 필요
(`NEXT_PUBLIC_AUTH_ENABLED=true`).

## `/projects` — `ProjectsView`

목록 / 생성 / 삭제. `LinkIconTile` + `FolderTileIcon` 타일 그리드이고, 타일 우상단
`IconMenu`에 삭제가 들어간다. 생성은 `Modal` 폼, 삭제는 `ConfirmDialog`.

`ProjectRead`는 `{id, name, description, created_by, created_at, updated_at}`뿐이다 —
문서 수·READY 수·멤버 같은 집계는 백엔드가 안 주므로 **타일에 집계를 그리지 않는다**(가짜 숫자를
만들지 말 것).

## `/projects/[projectId]` — `ProjectDocuments`

macOS Finder 창 메타포로 만든 단일 카드다. 한 화면에서 폴더 트리 · 경로 · 검색 · 목록을 다룬다.

- **타이틀바** — 신호등 3개 중 **빨강만 실제 버튼**(프로젝트 목록으로 이동)이고 나머지 둘은
  `aria-hidden` 장식이다.
- **경로(breadcrumb)** — `folderPath(activeFolder, folders)`로 조상 체인을 만든다. 각 조각이
  이동 버튼.
- **검색** — 현재 폴더 안에서만 이름을 필터하는 **클라이언트 사이드** 필터다(서버 질의 아님).
  폴더를 이동하면 `goToFolder()`가 검색어도 함께 비운다 — 안 그러면 새 폴더가 이유 없이 빈
  것처럼 보인다.
- **폴더 사이드바** — `FolderTree`(`parent_id` 기반, 생성/이름변경/삭제).
- **목록** — 폴더 행 먼저, 그다음 문서 행. 각 행은 `FolderTileIcon`/`FileTypeIcon` + 이름 +
  `StatusBadge` + 크기(`formatFileSize`) + 생성일 + `IconMenu`(정보 / 삭제).
- **선택한 폴더는 직계 자식만 보여준다** (`d.folder_id === activeFolder`). 예전에는 하위 폴더
  문서까지 합쳐 보여줬지만 Finder 메타포로 바꾸면서 직계로 바꿨다. 그래서 `FolderTree`의
  `descendantIds()`는 현재 **사용처가 없는 잔여 export**다 — 하위 포함 필터를 다시 넣을 때
  쓰거나 지운다.

### 행 마크업의 두 가지 함정

```tsx
<div className="group relative z-0 ... has-[[aria-expanded=true]]:z-20">
  <Link href={...} aria-label={d.name} className="absolute inset-0 z-0" />
  <span className="pointer-events-none ...">{/* 아이콘 + 이름 */}</span>
  <span className="z-10 w-7">{/* IconMenu */}</span>
</div>
```

- 행 전체를 클릭 영역으로 만들려고 링크를 `absolute inset-0`으로 깔았으므로, 콘텐츠는
  `pointer-events-none`, 케밥은 `z-10`으로 링크 위에 띄운다.
- `has-[[aria-expanded=true]]:z-20` — 드롭다운이 열린 행을 위로 올린다. 없으면 아래 행이
  메뉴를 덮는다.

### 반응형 / 스크롤

컬럼은 폭에 따라 단계적으로 숨긴다: 상태 `sm`, 크기 `md`, 생성일 `lg`. 폴더 사이드바는 `lg`
미만에서 위쪽으로 접힌다. 타이틀바·경로·컬럼 헤더는 고정이고 **파일 목록만 스크롤**한다.

### 업로드

`UploadDialog` — 드래그 드롭, 이미지/PDF/텍스트 미리보기, 제목, 폴더 선택
(`flattenFolders`로 depth 들여쓰기), 설명. `POST`가 **202**를 주므로 응답의 버전 id로
`pollVersion()`이 상태를 따라간다(종료 조건은 [architecture.md](../architecture.md) 참조).

`description`은 실제 `documents` 컬럼이다 — 업로드가 받고 `DocumentRead`가 돌려준다.

### 문서 정보

`DocumentInfoDialog` — 파일명/상태/버전/크기/작성자/생성일을 `Modal`로 보여준다. 작성자는
`author?.name || author?.email || created_by` 순으로 폴백한다.

## `/documents/[docId]` — `DocumentDetail`

`lg` 이상에서 3열 그리드(`[200px_1fr_380px]`): **개요 / 뷰어 / AI 패널**. 좁은 화면에서는
개요가 `<details>` 접이식으로 내려가고 뷰어·패널이 각각 `65vh` 블록이 된다.

- **메타데이터** — 상태, 버전(`V{version_no}`), 파일명, 크기, 설명, 버전 수. 현재 버전은
  `doc.current_version ?? versions.find(id) ?? versions[0]` 순으로 고른다.
- **개요 + 뷰어** — `GET /versions/{id}/sections`로 받은 파싱 결과를 그린다. 제목 없는 섹션은
  본문만 렌더한다. 개요 항목 클릭 → 뷰어의 `#sec-{section_id}`로 스크롤.
- **원본 보기** — 브라우저가 직접 그릴 수 있는 형식(`pdf`/`image`/`text`)만 모달 미리보기를
  제공한다(docx/hwpx 등 제외). blob은 인증 fetch로 받고 `revokeObjectURL`로 정리한다.
- **다운로드** — Bearer 토큰으로 blob을 받아 저장한다(단순 링크로는 인증이 안 붙는다).
- **처리 중 자동 갱신** — 상태가 종착이 아니면 다시 불러온다.
- **AI 패널** — `AiPanel`에 `status`, `fileExt`, `onFocusSection`, `onApplied`를 넘긴다.
  교정 적용이 끝나면 `onApplied`가 `load(true)`로 새 버전을 다시 읽는다 →
  [proofread.md](proofread.md).
