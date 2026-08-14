import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  StatusBadge,
  type DocStatus,
} from "@/components/ui/primitives";
import { Sparkline, AreaTrend, BarList, PipelineStrip } from "@/components/charts";

const stats = [
  { label: "프로젝트", value: "4", delta: "+1", up: true, spark: [2, 3, 3, 4, 4] },
  { label: "문서", value: "128", delta: "+12%", up: true, spark: [90, 98, 104, 116, 128] },
  { label: "처리 중", value: "3", delta: "-2", up: false, spark: [7, 6, 5, 4, 3] },
  { label: "오늘 RAG 질의", value: "27", delta: "+8", up: true, spark: [12, 15, 19, 22, 27] },
];

const weekData = [12, 18, 9, 24, 20, 31, 27];
const weekLabels = ["월", "화", "수", "목", "금", "토", "일"];

const typeBreakdown = [
  { label: "협의록", value: 42 },
  { label: "기획", value: 31 },
  { label: "개발", value: 28 },
  { label: "RULE", value: 17 },
  { label: "기타", value: 10 },
];

const pipeline: { label: string; count: number; tone: "done" | "active" | "idle" | "fail" }[] = [
  { label: "업로드됨", count: 5, tone: "idle" },
  { label: "분석 중", count: 2, tone: "active" },
  { label: "청킹", count: 1, tone: "active" },
  { label: "임베딩", count: 1, tone: "active" },
  { label: "준비 완료", count: 118, tone: "done" },
  { label: "실패", count: 1, tone: "fail" },
];

const recentDocs: { id: string; name: string; project: string; status: DocStatus }[] = [
  { id: "14", name: "개인정보처리지침.hwpx", project: "내부통제 · 내규", status: "READY" },
  { id: "22", name: "8월 시각화팀.docx", project: "기획 · 협의록", status: "EMBEDDING" },
  { id: "31", name: "사업계획서.docx", project: "개발", status: "PARSING" },
  { id: "09", name: "운영매뉴얼.pdf", project: "협의록", status: "READY" },
  { id: "45", name: "보안규정.pdf", project: "내부통제 · RULE", status: "FAILED" },
];

const activity = [
  { who: "김상현", initials: "KS", action: "규정 검증 실행", target: "개인정보처리지침.hwpx", when: "10분 전", kind: "규정" },
  { who: "이하라", initials: "LH", action: "문서 업로드", target: "8월 시각화팀.docx", when: "32분 전", kind: "업로드" },
  { who: "박지훈", initials: "PJ", action: "오타 검증 실행", target: "사업계획서.docx", when: "1시간 전", kind: "오타" },
  { who: "최민", initials: "CM", action: "RAG 질의", target: "개인정보 파기 절차", when: "2시간 전", kind: "RAG" },
];

const kindColor: Record<string, string> = {
  규정: "bg-primary-soft text-primary",
  업로드: "bg-sky-50 text-sky-700",
  오타: "bg-amber-50 text-amber-700",
  RAG: "bg-emerald-50 text-emerald-700",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-r from-primary-soft to-canvas px-6 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">안녕하세요, PCN 님 👋</h1>
          <p className="mt-1 text-sm text-ink-muted">
            오늘 <span className="font-medium text-primary">3건</span>의 문서가 처리 중이고,{" "}
            <span className="font-medium text-primary">27건</span>의 질의가 있었어요.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">＋ 문서 업로드</Button>
          <Button>＋ 새 프로젝트</Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-5 py-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-ink-muted">{s.label}</p>
              <span
                className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                  s.up ? "bg-emerald-50 text-emerald-700" : "bg-primary-soft text-primary"
                }`}
              >
                {s.up ? "▲" : "▼"} {s.delta}
              </span>
            </div>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-3xl font-semibold tracking-tight text-ink">{s.value}</p>
              <Sparkline data={s.spark} />
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>주간 문서 처리량</CardTitle>
            <span className="text-xs text-ink-muted">최근 7일 · 총 141건</span>
          </CardHeader>
          <div className="p-4">
            <AreaTrend data={weekData} labels={weekLabels} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>문서 유형 분포</CardTitle>
          </CardHeader>
          <div className="p-5">
            <BarList items={typeBreakdown} />
          </div>
        </Card>
      </div>

      {/* Pipeline */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>문서 처리 파이프라인</CardTitle>
          <span className="text-xs text-ink-muted">실시간 처리 현황</span>
        </div>
        <PipelineStrip stages={pipeline} />
      </Card>

      {/* Recent docs + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>최근 문서</CardTitle>
            <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
              전체 보기
            </Link>
          </CardHeader>
          <ul className="divide-y divide-border">
            {recentDocs.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-surface"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">
                      <IconDoc />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                      <p className="text-xs text-ink-muted">{d.project}</p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
                  {a.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{a.who}</span>
                    <span className="text-ink-muted"> · {a.action}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">{a.target}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${kindColor[a.kind]}`}>
                    {a.kind}
                  </span>
                  <span className="text-[11px] text-ink-muted">{a.when}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    </svg>
  );
}
