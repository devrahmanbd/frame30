/**
 * Phase 8 — the one trend on the dashboard.
 *
 * A dependency-free area/line chart drawn in the brand teal (`--fq-accent`),
 * with an accessible table fallback for screen readers. It shows a single
 * series: no legends, no gridlines, no axis furniture — one shape, one number.
 */
import { useId, useMemo, useState } from "react";

export type TrendPoint = { date: string; value: number };

function path(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export function TrendChart({
  points,
  format,
  label,
  height = 132,
}: {
  points: TrendPoint[];
  format: (value: number) => string;
  label: string;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const w = 600;
    const h = height;
    const pad = 8;
    const max = Math.max(1, ...points.map((p) => p.value));
    const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => ({
      x: pad + i * step,
      y: h - pad - (p.value / max) * (h - pad * 2),
    }));
    return { w, h, pad, coords };
  }, [points, height]);

  if (points.length === 0) {
    return <p className="text-sm fq-sub">No data for this window yet.</p>;
  }

  const { w, h, coords } = geometry;
  const active = hover === null ? points.length - 1 : hover;
  const activePoint = points[active]!;

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm fq-sub">{label}</span>
        <span className="fq-num text-sm font-medium text-foreground">
          {format(activePoint.value)}
          <span className="ml-2 fq-sub">
            {new Date(activePoint.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-2 h-[132px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fq-brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--fq-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${path(coords)} L${coords[coords.length - 1]!.x},${h} L${coords[0]!.x},${h} Z`}
          fill={`url(#${gradientId})`}
        />
        <path
          d={path(coords)}
          fill="none"
          stroke="var(--fq-brand)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={coords[active]!.x}
          cy={coords[active]!.y}
          r={3.5}
          fill="var(--fq-brand)"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <rect
            key={points[i]!.date}
            x={c.x - (w / Math.max(points.length, 1)) / 2}
            y={0}
            width={w / Math.max(points.length, 1)}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{p.date}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
