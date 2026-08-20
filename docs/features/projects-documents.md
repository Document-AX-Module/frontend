# 프로젝트 · 문서

엔드포인트 표는 [api-spec.md §2·§3](../api-spec.md). 모두 로그인 필요
(`NEXT_PUBLIC_AUTH_ENABLED=true`).

## `/projects` — `ProjectsView`

목록 / 생성 / 삭제. `LinkIconTile` + `FolderTileIcon` 타일 그리드이고, 타일 서브라벨에
`VisibilityBadge`, 우상단 `IconMenu`에 정보 / 멤버·공개 범위 / 삭제가 들어간다. 생성은 `Modal`
폼, 삭제는 `ConfirmDialog`. `GET /projects`가 이미 접근 가능한 프로젝트(public 전체 + 내
invite + 내 private)로 스코핑돼 오므로 프론트에서 별도로 거를 게 없다.

`ProjectRead`는 `{id, name, description, created_by, owner_id, visibility, created_at,
updated_at}`. 문서 수·READY 수 같은 집계는 백엔드가 안 주므로 **타일에 집계를 그리지 않는다**
(가짜 숫자를 만들지 말 것).

### 받은 초대 — `ProjectInvitations`

`/projects` 상단에 붙는 카드로, **받은 초대가 없으면 아무것도 렌더하지 않는다**(평소 화면을
어지럽히지 않기 위해). 수락 전에는 그 프로젝트가 `GET /projects`에 안 나오고 상세도 403이므로,
카드는 `GET /projects/invitations`의 필드(`project_name`, `invited_by_name/email`, `invited_at`,
`visibility`, `project_description`)**만으로** 그린다 — 문서 수 같은 추가 조회는 불가능하다.

- **수락**은 `ProjectRead`를 돌려주므로 그걸 그대로 `ProjectsView`의 `projects` 앞에 끼워 넣어
  타일을 즉시 띄운다. 화면 이동은 하지 않는다 — 초대가 여러 건일 때 하나 수락하고 튕겨나가면
  나머지를 다시 찾아야 한다.
- **거절**은 204다. 멤버 행은 `rejected`로 남아 owner가 결과를 보고 재초대할 수 있다.
- 목록 로드 실패는 **조용히 무시**한다(초대는 보조 정보라 프로젝트 목록 화면을 망치지 않는다).
  수락/거절 실패만 카드 안 `ErrorBanner`로 보여준다.

### 공개 범위 · 멤버 — `ProjectMembersDialog`

`ProjectsView`(타일 메뉴 "멤버 · 공개 범위")와 `ProjectDocuments`(헤더의 "멤버" 버튼)가
**같은 다이얼로그를 공유**한다. 열릴 때 `listProjectMembers()`로 멤버 목록을 읽는다.
**owner(또는 `role === "admin"`)만** 공개 범위·초대·제거를 조작할 수 있고, 그 외 사용자는 현재
가시성 + 멤버 목록만 읽기 전용으로 본다. owner 본인 행에는 제거 버튼을 그리지 않는다(백엔드도
403으로 막지만 UI가 먼저 막는다).

owner 판정은 두 화면에서 동일하게 `user?.role === "admin" || project.owner_id === user?.id`.
같은 판정으로 프로젝트 타일 메뉴의 "삭제"도 owner에게만 보인다 — `DELETE /projects/{id}`가 owner
전용이기 때문.

**공개 범위 변경은 즉시 커밋하지 않는다.** 라디오 선택은 `pendingVisibility` 로컬 초안일 뿐이고,
"공개 범위 적용" 버튼을 눌러야 `updateProjectVisibility()`가 호출된다. 미적용 상태에서는 되돌리기가
함께 보이고, 모달을 닫으면 초안은 버려진다.

가시성이 적용되면 다이얼로그가 갱신된 `Project`를 상위로 돌려주고, `ProjectsView`는 `projects`
state와 타일 배지를, `ProjectDocuments`는 `project` state와 헤더 배지를 갱신한다.

**생성 폼**에는 가시성 라디오 3개(공개/초대/비공개, 기본값 공개 — 백엔드 기본값과 동일)가 있고,
선택에 따라 설명 문구가 바뀐다. 생성 후 다이얼로그를 **자동으로 열지 않는다** — 초대는 항상 사용자가
직접 시작한다(아래).

#### 초대는 두 번 좁혀서 보여준다

초대 UI가 언제 보이는지가 이 다이얼로그의 핵심 규칙이다:

1. **공개 범위가 `invite`일 때만.** `public`은 로그인한 모두가, `private`은 owner만 볼 수 있어서
   멤버를 추가해도 접근 범위가 달라지지 않는다 — 그런 프로젝트에 초대 UI를 띄우면 "초대하면
   보이게 되나?"라는 잘못된 기대를 만든다. owner가 `public`/`private` 프로젝트를 열면 버튼 대신
   그 이유를 한 줄로 설명한다(버튼이 없는 게 버그로 보이지 않게).
2. **"＋ 멤버 초대"를 누른 뒤에만.** 열자마자 초대 폼이 펼쳐져 있지 않다. 다이얼로그를 여는 목적은
   대개 멤버 확인이고, 초대는 명시적인 행동이다.

판정은 **커밋된** `project.visibility`로 한다(`pendingVisibility` 초안이 아니다) — 아직 적용하지
않은 범위로는 초대해도 접근 권한이 생기지 않는다.

#### 초대 = 이메일 입력이 아니라 사용자 검색

초대 패널은 `GET /users/search`(디바운스 300ms, **최소 2자**)로 가입 사용자를 찾아 **클릭으로**
초대한다. `exclude_project_id`에 현재 프로젝트를 넘겨 이미 멤버이거나 초대 대기 중인 사람을
백엔드가 걸러 주므로 프론트에서 다시 거르지 않는다(거절한 사용자는 재초대가 가능해서 계속 나온다).
초대에 성공하면 그 사용자를 검색 결과에서 즉시 빼서 두 번 누르는 것을 막는다.

**미가입자는 초대할 수 없다** — 이메일 초대장 발송 기능이 없어서 검색에 없는 이메일로 초대하면
400이다. 그래서 hint에 "가입된 사용자만 초대할 수 있습니다"를 명시하고, 검색 결과가 비면 "이미
초대했거나 가입하지 않은 사용자입니다"로 안내한다. `POST .../members`의 body는 `{user_id}` 또는
`{email}` 중 정확히 하나여야 하므로(`inviteProjectMember()`), 프론트는 항상 `user_id`만 보낸다.

#### pending / active / rejected

**초대해도 바로 멤버가 되지 않는다.** 응답이 `status: "pending"`이므로 목록 뱃지는 "초대함"이 아니라
**"수락 대기중"** 이다. `GET .../members`가 세 상태를 한 목록에 섞어 주고, 라벨/톤은
`memberStatusLabel()`/`MemberStatusBadge`(`primitives.tsx`)가 유일한 출처다. 소유자 행에는 뱃지를
그리지 않는다(항상 `active`라 정보가 없다).

제거 버튼 문구도 `status`로 분기한다 — `DELETE .../members/{user_id}` 하나가 세 가지를 겸하고
응답(204)만으로는 구분되지 않기 때문이다:

| `status` | 버튼 문구 | 의미 |
|---|---|---|
| `pending` | 초대 취소 | 수락 전 초대 회수 (당사자에게 알림 안 감) |
| `active` | 멤버 제거 | 접근 권한 회수 (당사자에게 `project.member_removed` 알림) |
| `rejected` | 목록에서 지우기 | 거절 기록 정리 |

어느 쪽이든 행을 지우므로 **재초대가 가능**하다. 초대/수락/거절/제거는 상대에게 알림이 가고, 그
종류와 수신자는 [notifications.md](notifications.md)에 정리했다.

## `/projects/[projectId]` — `ProjectDocuments`

macOS Finder 창 메타포로 만든 단일 카드다. 한 화면에서 폴더 트리 · 경로 · 검색 · 목록을 다룬다.

- **페이지 헤더** — 공개 범위 배지는 `PageHeader`의 `titleBadge`로 **프로젝트명 옆**에 붙는다
  (버튼 줄에 두면 배지가 버튼처럼 보인다). 우측 `actions`는 "멤버" 버튼 + 문서 업로드뿐이다.
  프로젝트 목록으로 돌아가지 않고도 문서함 안에서 `ProjectMembersDialog`를 열 수 있다(위 절과 같은
  컴포넌트). 버튼 문구가 "멤버 초대"가 아닌 이유는 초대가 다이얼로그 **안의** "＋ 멤버 초대"에서만
  시작되고, `invite` 프로젝트가 아니면 초대 자체가 없기 때문이다.
- **타이틀바** — 신호등 3개 중 **빨강만 실제 버튼**(프로젝트 목록으로 이동)이고 나머지 둘은
  `aria-hidden` 장식이다.
- **경로(breadcrumb)** — `folderPath(activeFolder, folders)`로 조상 체인을 만든다. 각 조각이
  이동 버튼.
- **검색** — 현재 폴더 안에서만 이름을 필터하는 **클라이언트 사이드** 필터다(서버 질의 아님).
  폴더를 이동하면 `goToFolder()`가 검색어도 함께 비운다 — 안 그러면 새 폴더가 이유 없이 빈
  것처럼 보인다.
- **폴더 사이드바** — `FolderTree`(`parent_id` 기반, 생성/이름변경(인라인)/삭제/드래그앤드롭
  순서변경/드래그앤드롭 문서 이동). 형제 정렬은 `Folder.rank` 오름차순 — 백엔드가
  `PATCH /folders/{id}/reorder`로 부여한다. 드롭 시 `FolderTree`의
  `onReorder(folderId, parentId, targetIndex)`가 `reorderFolder()` (`src/lib/projects.ts`)를
  호출하고, 응답으로 온 영향받은 형제 목록(새 `rank` 포함)을 `folders` state에 병합한다. 실패하면
  (권한/네트워크) 다른 폴더 변경(삭제)과 동일하게 `ErrorBanner`로 노출하고 화면 순서는 되돌리지
  않는다(다음 새로고침에서 서버 상태로 정정됨). 오른쪽 파일 목록의 폴더 행도 같은 `rank` 기준으로
  정렬하므로 사이드바와 항상 일치한다.
- **폴더 이름 변경은 모달이 아니라 인라인** — 연필 아이콘을 누르면 라벨 자리가 그대로
  `<input defaultValue={folder.name} autoFocus>`로 바뀐다(비제어 입력, `FolderRow`). `Enter`는
  `blur()`로 커밋 로직을 재사용하고 `Escape`는 취소, `onBlur`는 값이 비어있지 않고 바뀌었을 때만
  `onRename(folder, name)`을 호출한다. 실패하면 그냥 보기 모드로 닫히고 `folders` prop(원래
  이름)이 그대로 남는다 — 되돌릴 로컬 state가 없다. 파일 목록 쪽 폴더 행에는 더 이상 별도의
  "이름 변경" 메뉴가 없다(사이드바가 유일한 진입점).
- **목록** — 폴더 행 먼저, 그다음 문서 행. 각 행은 `FolderTileIcon`/`FileTypeIcon` + 이름 +
  `StatusBadge` + 크기(`formatFileSize`) + 생성일 + `IconMenu`(폴더: 삭제 / 문서: 정보·이동·삭제).
  문서 행은 `draggable`이라 `FolderTree`의 폴더 위로 끌어다 놓으면(같은 프로젝트 안에서만) 그
  자리에서 `folder_id`가 바뀐다 — 아래 "문서 이동" 참고.
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

### 문서 이동 — `MoveDocumentDialog` + 폴더 트리 드래그앤드롭

`PATCH /documents/{id}/move`(`moveDocument()`, `src/lib/documents.ts`)를 두 가지 경로로 쓴다:

- **다른 프로젝트로(개인 → 공유 등)** — 문서 행 `IconMenu`의 "이동" → `MoveDocumentDialog`.
  프로젝트 `Select`(기본값 = 현재 프로젝트, `listProjects()`)를 고르면 그 프로젝트의
  `listFolders()`로 폴더 `Select`를 다시 채운다(`flattenFolders()`로 depth 들여쓰기, 프로젝트가
  바뀔 때마다 "최상위"로 리셋). 확정하면 선택한 프로젝트가 현재 프로젝트와 같을 때만
  `project_id`를 생략해서 보낸다(백엔드가 생략 시 "현재 프로젝트 유지"로 해석). 다른 프로젝트로
  옮겨졌으면 `ProjectDocuments`가 로컬 `documents`에서 그 문서를 제거하고, 같은 프로젝트 안에서
  폴더만 바뀌었으면 `folder_id`만 갱신한다.
- **같은 프로젝트 폴더 사이는 드래그앤드롭** — 문서 행이 `draggable`이고 `dragstart`에서
  `dataTransfer`에 `application/x-document-id`(`FolderTree.tsx`가 내보내는
  `DOCUMENT_DRAG_TYPE`)로 문서 id를 싣는다. `FolderTree`의 각 폴더 행(최상위 "전체" 포함)이 이
  타입을 보고 폴더 재정렬 드래그(`dragId` 컴포넌트 state)와 구분해서 받으며, 드롭되면
  `onDropDocument(documentId, folderId)` → `moveDocument(id, { folder_id })`(`project_id` 생략)를
  호출하고 성공하면 해당 문서의 `folder_id`만 로컬에서 갱신한다(같은 프로젝트라 목록에서 사라지지
  않는다).

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
  [proofread.md](proofread.md). `문서 비교` 탭은 버전 두 개를 골라 섹션 단위 diff를 모달로
  보여준다 → [document-diff.md](document-diff.md).
