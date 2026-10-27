import { memo, useMemo } from "react";

import type { BufferBasis, DistributionResponse } from "../api/types";
import { formatGwTick } from "../lib/format";
import { bufferLineLabel } from "../lib/kpis";
import { chart } from "../lib/theme";

const W = 320;
const H = 72;
const BASE = H - 14;

/**
 * The error histogram as a small strip with the buffer line: bars left of the line are the hours
 * the buffer covers. Plain SVG, so the hero renders before the chart chunk loads.
 */
export const MiniDistribution = memo(function MiniDistribution({
  data,
  bufferMw,
  basis,
}: {
  data: DistributionResponse;
  bufferMw: number | null;
  basis: BufferBasis;
}) {
  const g = useMemo(() => {
    const bins = data.bins;
    const lo = Math.min(...bins.map((b) => b.lower_mw));
    const hi = Math.max(...bins.map((b) => b.upper_mw));
    const max = Math.max(...bins.map((b) => b.count), 1);
    const x = (mw: number) => ((mw - lo) / (hi - lo || 1)) * W;
    return { bins, lo, hi, max, x };
  }, [data]);

  const bx = bufferMw === null ? null : g.x(Math.min(Math.max(bufferMw, g.lo), g.hi));
  const label = bufferMw === null ? null : bufferLineLabel(bufferMw, basis);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label={`Error distribution${label ? ` with the ${label}` : ""}`}
    >
      {g.bins.map((b) => {
        const x0 = g.x(b.lower_mw) + 0.75;
        const w = Math.max(g.x(b.upper_mw) - g.x(b.lower_mw) - 1.5, 0.5);
        const h = (b.count / g.max) * (BASE - 4);
        const mid = (b.lower_mw + b.upper_mw) / 2;
        const beyond = bufferMw !== null && b.lower_mw >= bufferMw;
        return (
          <rect
            key={b.lower_mw}
            x={x0}
            y={BASE - h}
            width={w}
            height={h}
            rx={1.5}
            fill={mid > 0 ? chart.shortfall : chart.surplus}
            opacity={beyond ? 1 : 0.45}
          />
        );
      })}
      <line x1={0} x2={W} y1={BASE + 0.5} y2={BASE + 0.5} stroke={chart.axis} />
      {g.lo < 0 && g.hi > 0 && (
        <text
          x={g.x(0)}
          y={H - 2}
          textAnchor="middle"
          fill={chart.muted}
          fontSize={10}
          fontFamily="var(--font-mono)"
        >
          0
        </text>
      )}
      <text x={0} y={H - 2} fill={chart.muted} fontSize={10} fontFamily="var(--font-mono)">
        {formatGwTick(g.lo)} GW
      </text>
      <text
        x={W}
        y={H - 2}
        textAnchor="end"
        fill={chart.muted}
        fontSize={10}
        fontFamily="var(--font-mono)"
      >
        +{formatGwTick(g.hi)} GW
      </text>
      {bx !== null && (
        <g>
          <line
            x1={bx}
            x2={bx}
            y1={0}
            y2={BASE}
            stroke={chart.text}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <circle cx={bx} cy={0} r={2.5} fill={chart.text} />
        </g>
      )}
    </svg>
  );
});
