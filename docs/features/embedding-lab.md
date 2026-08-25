# Embedding Lab (`/embedding-lab`)

`src/app/embedding-lab/page.tsx` + `src/lib/embedding.ts` + `src/components/embedding-lab/*`.
사이드바 "관리자" 섹션에서 들어간다. 엔드포인트는 [api-spec.md §9](../api-spec.md). **전부
`require_admin`**이라 관리자가 아니면 403이 난다.

## 접근 제어

- `useAuth().user.role === "admin"`이 아니면 페이지가 `ErrorBanner`만 보여주고 아무것도
  불러오지 않는다(로그인 안 됨 → `needLogin`, 로그인은 됐지만 admin 아님 → 권한 메시지).
- 사이드바의 "관리자" 섹션(Embedding Lab 링크)도 같은 조건으로 숨긴다 — `Sidebar.tsx`.
- 목업 로그인 유저는 기본 `role: "member"`라 로컬에서 확인하려면 admin 계정이 필요하다.

## 구성 — 탭 3개

`AiPanel`과 같은 밑줄 탭 패턴(`FOCUS_RING`, `border-b-2 border-primary`)을 페이지 레벨에서 재사용한다.

### 1. 모델 (`ModelsPanel`)

- `listModels()` → 테이블(모델명/키/버전, `EmbeddingModelStatusBadge`, dimension, max_tokens).
- **활성화** — `activateModel(id)`. 청킹 설정은 바뀌지 않는다(모델만 전환).
- **재임베딩** — `ConfirmDialog`로 확인 후 `reembedModel(id)` → 202 + `EmbeddingJobRead`.
  받은 `job.id`를 그 행 아래 `JobProgress`로 폴링한다. 청킹은 그대로 두고
  `document_chunks` 전체를 이 모델로 다시 임베딩하는, 운영에 영향을 주는 작업이라 확인을 거친다.

### 2. 벤치마크 (`BenchmarkPanel`)

- 데이터셋 선택(`listDatasets()`) + 비교할 모델 다중 선택(체크박스) + **청킹 파라미터
  override**(전략 structure/semantic, chunk 크기, overlap, 문장 윈도우, breakpoint 백분위 —
  전부 선택 입력, 비우면 활성 설정을 그대로 씀).
- **실행** → `runBenchmark({dataset_id, model_ids, chunking_config})` → 202 + `{run_id}`.
  `getBenchmark(run_id)`를 3초 간격으로 폴링하다 run.status가 `COMPLETED`/`FAILED`가 되면 멈춘다.
- **실행 이력** — `listBenchmarks()`가 결과(`results[]`)까지 포함해 돌려주므로 목록 자체가 이미
  상세 뷰다. 모델별로 recall@1/3/5·MRR·nDCG·평균 쿼리 지연·RAM·종합 score를 표로 보여준다.
- **운영 적용** — 완료된 결과 행마다 버튼. `applyBenchmark(run_id, model_id)`로 (청킹 설정,
  모델) 조합을 운영 기본값으로 바꾼다. **기존 문서는 재처리되지 않는다** — 필요하면 마이그레이션
  탭에서 별도로 실행해야 한다(안내 문구로 명시).
- **데이터셋 만들기** (`DatasetModal`) — 이름/설명/프로젝트(선택) + 질문 목록. 질문마다 ground
  truth 스니펫(`document_id` + `expected_snippet` + `page_start?`)을 1개 이상 요구한다.
  프로젝트를 고르면 그 프로젝트 문서 목록에서 `document_id`를 드롭다운으로 고를 수 있고, 안
  고르면 숫자 입력으로 대체한다. `createDataset()` 성공 시 방금 만든 데이터셋을 바로 선택한다.

### 3. 마이그레이션 (`MigrationPanel`)

- 프로젝트를 고르면 그 프로젝트 문서 중 `current_version`이 있는 것만 체크박스 테이블로 보여준다
  (문서명 · 버전 번호 · `StatusBadge`로 처리 상태).
- `force_semantic` 토글 + `ConfirmDialog` 확인 후 `migrate({document_version_ids, force_semantic})`
  → 202 + `EmbeddingJobRead` → `JobProgress`로 폴링. 완료되면 문서 목록을 다시 불러온다.

## 공용 조각

- **`JobProgress`** — `reembed`/`migrate`가 공유하는 `EmbeddingJobRead` 폴링 컴포넌트(2초 간격,
  최대 5분). `processed_count`/`target_count`로 진행률 바를 채우고, 상태는
  `EmbeddingJobStatusBadge`(`RUNNING`/`COMPLETED`/`FAILED` — job·benchmark run·result가 공유하는
  어휘라 배지 하나로 셋 다 표시한다), 실패 시 `job.error`를 `ErrorBanner`로 보여준다.
- 상태 라벨/배지는 전부 `primitives.tsx`의 `embeddingModelStatusLabel`/`EmbeddingModelStatusBadge`,
  `embeddingJobStatusLabel`/`EmbeddingJobStatusBadge`로만 나온다 — 호출부에서 다시 맵을 선언하지
  않는다(CLAUDE.md 규칙 4).

## 하지 않는 것

- 작업(job) 목록 조회 API가 없어 "최근 재임베딩/마이그레이션 이력"은 보여주지 않는다 — 진행 중인
  건만 방금 받은 `job.id`로 폴링한다. 새로고침하면 진행 상황을 잃는다(백엔드에 `GET
  /embedding/jobs`가 생기면 보완할 것).
- 벤치마크 데이터셋 수정/삭제 UI는 없다(백엔드에 해당 엔드포인트가 없음).
