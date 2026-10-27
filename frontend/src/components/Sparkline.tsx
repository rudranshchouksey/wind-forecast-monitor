import { memo, useMemo, useState, type PointerEvent } from "react";

import { formatDeliveryDay, formatMw } from "../lib/format";
import { chart } from "../lib/theme";

export interface SparkPoint {
  key: string;
  value: number | null;
}

const W = 160;
const H = 28;
const PAD = 2;

interface SparklineProps {
  points: SparkPoint[];
  /** The exact statistic: the visible label, the hover readout and the aria label all name it. */
  label: string;
  signed?: boolean;
  /** Line colour (a chart token); defaults to the muted text colour. */
  color?: string;
}

/**
 * A 28 px daily trend line. Hovering shows the day and value in place of the label; the state is
 * local, so hovering never re-renders the tile or the page.
 */
export const Sparkline = memo(function Sparkline({
  points,
  label,
  signed = false,
  color = chart.text2,
}: SparklineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const geom = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
    if (vals.length < 2) return null;
    const lo = Math.min(...vals, signed ? 0 : Infinity);
    const hi = Math.max(...vals, signed ? 0 : -Infinity);
    const span = hi - lo || 1;
    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      if (p.value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
    });
    return { d, x, y, zero: signed ? y(0) : null, lo, hi };
  }, [points, signed]);

  if (!geom) return null;
  const fmt = (v: number | null) => formatMw(v, { signed });
  const first = points[0];
  const last = points[points.length - 1];
  const aria = `${label}, ${points.length} delivery days${
    first && last ? ` from ${formatDeliveryDay(first.key)} to ${formatDeliveryDay(last.key)}` : ""
  }: lowest ${fmt(geom.lo)}, highest ${fmt(geom.hi)}`;
  const active = hover === null ? null : points[hover];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = r.width ? (e.clientX - r.left) / r.width : 0;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))));
  };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-7 w-full overflow-visible"
        role="img"
        aria-label={aria}
        onPointerMove={onMove}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <title>{label}</title>
        {geom.zero !== null && (
          <line
            x1={0}
            x2={W}
            y1={geom.zero}
            y2={geom.zero}
            stroke={chart.axis}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={geom.d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {active && active.value !== null && hover !== null && (
          <circle
            cx={geom.x(hover)}
            cy={geom.y(active.value)}
            r={2.5}
            fill={chart.text}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="mt-1 truncate text-micro text-muted" aria-hidden="true">
        {active ? (
          <>
            {formatDeliveryDay(active.key)} ·{" "}
            <span className="font-mono text-ink-2">{fmt(active.value)}</span> {label.toLowerCase()}
          </>
        ) : (
          label
        )}
      </figcaption>
    </figure>
  );
});
