"use client";

// ============================================================
// Lekcja 11, W2: Wykresy dashboardu — czyste SVG
// ------------------------------------------------------------
// Warsztat dopuszcza recharts / Chart.js / czyste SVG. Wybrałem SVG:
// trzy proste wykresy nie są warte ~500 kB zależności, a kolory biorą się
// wtedy wprost z tokenów systemu "paper" (var(--ink), var(--dot-*)), więc
// wykresy nie odklejają się wizualnie od reszty aplikacji.
//
// Każdy wykres rysuje się w stałym układzie współrzędnych (viewBox) i
// skaluje do szerokości rodzica — dlatego rozmiary poniżej są w jednostkach
// viewBoxa, nie w pikselach.
// ============================================================

export type ChartPoint = { label: string; value: number };

/** Kolejność kolorów dla wycinków wykresu kołowego. */
export const PALETTE = [
  "var(--dot-ops)",
  "var(--dot-sales)",
  "var(--dot-mkt)",
  "var(--dot-fin)",
  "var(--info)",
  "var(--muted)",
];

// Górna granica osi Y zaokrąglona "do ładnej liczby" (1-2-5 × 10^n), żeby
// podpisy osi nie wyglądały jak 13 437.
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const rest = value / magnitude;
  const step = rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 5 ? 5 : 10;
  return step * magnitude;
}

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

// Wspólna geometria obu wykresów osiowych.
const W = 320;
const H = 150;
const PAD = { left: 32, right: 8, top: 12, bottom: 26 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function Axes({ max }: { max: number }) {
  const ticks = [0, 0.5, 1];
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.top + PLOT_H * (1 - t);
        return (
          <g key={t}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="var(--line)"
              strokeWidth={0.7}
            />
            <text
              x={PAD.left - 5}
              y={y + 2.5}
              textAnchor="end"
              fontSize={7}
              fill="var(--muted)"
            >
              {short(max * t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ points }: { points: ChartPoint[] }) {
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : 0;
  return (
    <g>
      {points.map((p, i) => (
        <text
          key={p.label}
          x={PAD.left + step * i}
          y={H - 8}
          textAnchor="middle"
          fontSize={7}
          fill="var(--muted)"
        >
          {p.label}
        </text>
      ))}
    </g>
  );
}

/** Wykres liniowy z delikatnym wypełnieniem pod linią. */
export function LineChart({
  points,
  title,
}: {
  points: ChartPoint[];
  title: string;
}) {
  if (points.length === 0) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : 0;
  const xy = points.map((p, i) => ({
    x: PAD.left + step * i,
    y: PAD.top + PLOT_H * (1 - p.value / max),
  }));
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area =
    `M ${xy[0].x},${PAD.top + PLOT_H} ` +
    xy.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${xy[xy.length - 1].x},${PAD.top + PLOT_H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <Axes max={max} />
      <path d={area} fill="var(--ink)" opacity={0.06} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {xy.map((p, i) => (
        <circle
          key={points[i].label}
          cx={p.x}
          cy={p.y}
          r={2.2}
          fill="var(--card)"
          stroke="var(--ink)"
          strokeWidth={1.2}
        />
      ))}
      <XLabels points={points} />
    </svg>
  );
}

/** Wykres słupkowy. */
export function BarChart({
  points,
  title,
}: {
  points: ChartPoint[];
  title: string;
}) {
  if (points.length === 0) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : PLOT_W;
  const barW = Math.min(26, step * 0.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <Axes max={max} />
      {points.map((p, i) => {
        const h = (p.value / max) * PLOT_H;
        return (
          <g key={p.label}>
            <rect
              x={PAD.left + step * i - barW / 2}
              y={PAD.top + PLOT_H - h}
              width={barW}
              height={Math.max(h, p.value > 0 ? 1.5 : 0)}
              rx={2}
              fill="var(--dot-ops)"
            />
            {p.value > 0 && (
              <text
                x={PAD.left + step * i}
                y={PAD.top + PLOT_H - h - 3}
                textAnchor="middle"
                fontSize={7}
                fill="var(--ink-soft)"
              >
                {p.value}
              </text>
            )}
          </g>
        );
      })}
      <XLabels points={points} />
    </svg>
  );
}

/**
 * Wykres kołowy (pierścień). `pathLength={100}` sprawia, że długość obwodu
 * to zawsze 100 jednostek — wycinki liczy się wprost w procentach, bez
 * przeliczania przez 2πr.
 */
export function DonutChart({
  slices,
  title,
}: {
  slices: { label: string; value: number }[];
  title: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={title} className="adm-donut">
      <title>{title}</title>
      <circle cx="60" cy="60" r="42" fill="none" stroke="var(--line-soft)" strokeWidth={16} />
      {slices.map((s, i) => {
        const pct = (s.value / total) * 100;
        const dash = `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`;
        const el = (
          <circle
            key={s.label}
            cx="60"
            cy="60"
            r="42"
            fill="none"
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={16}
            pathLength={100}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += pct;
        return el;
      })}
    </svg>
  );
}
