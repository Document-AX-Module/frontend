/*
 * Lightweight, dependency-free inline-SVG charts for the dashboard skeleton.
 * Single-hue (brand red) by design — magnitude/trend only, so no categorical
 * palette and no colorblind validation is required. Marks follow the house
 * spec: 2px lines, rounded bar ends, recessive grid, native <title> hover.
 */

const RED = "#b01c2e";

/* --- Tiny sparkline for stat tiles --- */
export function Sparkline({ data }: { data: number[] }) {
  const W = 72;
  const H = 26;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = W / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={RED}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* --- Weekly processing trend (area + line + dots) --- */
export function AreaTrend({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const W = 660;
  const H = 240;
  const padX = 20;
  const padTop = 18;
  const padBottom = 34;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const max = Math.max(...data) * 1.2 || 1;
  const step = innerW / (data.length - 1);

  const pts = data.map((v, i) => ({
    x: padX + i * step,
    y: padTop + innerH * (1 - v / max),
    v,
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const baseY = padTop + innerH;
  const area = `${line} L${(padX + innerW).toFixed(1)} ${baseY} L${padX} ${baseY} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RED} stopOpacity="0.22" />
          <stop offset="100%" stopColor={RED} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* recessive gridlines */}
      {grid.map((t) => (
        <line
          key={t}
          x1={padX}
          x2={padX + innerW}
          y1={padTop + innerH * t}
          y2={padTop + innerH * t}
          stroke="var(--color-border)"
          strokeWidth="1"
        />
      ))}

      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={RED} strokeWidth="2" />
          <title>{`${labels[i]}: ${p.v}건`}</title>
        </g>
      ))}

      {/* x labels */}
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={H - 12}
          textAnchor="middle"
          className="fill-[var(--color-ink-muted)]"
          fontSize="11"
        >
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

/* --- Horizontal magnitude bars (single hue) --- */
export function BarList({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-ink-muted">{it.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2" title={`${it.label}: ${it.value}`}>
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((it.value / max) * 100, 6)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-medium text-ink">{it.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- Processing pipeline strip --- */
export function PipelineStrip({
  stages,
}: {
  stages: { label: string; count: number; tone: "done" | "active" | "idle" | "fail" }[];
}) {
  const tone: Record<string, string> = {
    done: "border-emerald-200 bg-emerald-50 text-emerald-700",
    active: "border-sky-200 bg-sky-50 text-sky-700",
    idle: "border-border bg-surface text-ink-muted",
    fail: "border-primary/30 bg-primary-soft text-primary",
  };
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className={`min-w-[92px] rounded-lg border px-3 py-2.5 text-center ${tone[s.tone]}`}>
            <p className="text-lg font-semibold leading-none">{s.count}</p>
            <p className="mt-1 text-[11px]">{s.label}</p>
          </div>
          {i < stages.length - 1 && <span className="text-border">→</span>}
        </div>
      ))}
    </div>
  );
}
