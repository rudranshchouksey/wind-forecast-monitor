import { memo, useMemo } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { SeriesPoint } from "../../api/types";
import { formatDay, formatGwTick, formatHours, formatLondon, formatMw } from "../../lib/format";
import { chart } from "../../lib/theme";
import { extent, niceTicks } from "../../lib/ticks";
import { TooltipBox } from "../ChartTooltip";
import { DRAW_MS, useDrawOnce } from "./drawIn";

interface Row {
  t: number;
  actual: number;
  forecast: number;
  corrected: number | null;
  error: number;
  /** [low, high] of forecast and actual: the shaded gap. */
  gap: [number, number];
  publish: string;
  horizon: number;
}

function toRows(points: SeriesPoint[]): Row[] {
  return points.map((p) => ({
    t: Date.parse(p.target_time),
    actual: p.actual_mw,
    forecast: p.forecast_mw,
    corrected: p.corrected_mw,
    error: p.error_mw,
    gap: [Math.min(p.actual_mw, p.forecast_mw), Math.max(p.actual_mw, p.forecast_mw)],
    publish: p.publish_time,
    horizon: p.horizon_h,
  }));
}

// Derived series: dashed as well as coloured, so it never relies on hue alone.
const CORRECTED_DASH = "6 3";
const activeDot = { r: 4, stroke: chart.panel, strokeWidth: 2 } as const;

function MainTooltip({
  active,
  payload,
  showCorrected,
}: TooltipProps<number, string> & { showCorrected: boolean }) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  const kind = row.error > 0 ? "shortfall" : row.error < 0 ? "surplus" : "exact";
  return (
    <TooltipBox
      title={formatLondon(row.t)}
      rows={[
        { label: "actual", value: formatMw(row.actual), color: chart.actual },
        { label: "forecast", value: formatMw(row.forecast), color: chart.forecast },
        ...(showCorrected
          ? [{ label: "bias-corrected", value: formatMw(row.corrected), color: chart.corrected }]
          : []),
        { label: `error (${kind})`, value: formatMw(row.error, { signed: true }) },
      ]}
      footer={
        <>
          Forecast published {formatLondon(row.publish)} ({formatHours(row.horizon)} ahead)
        </>
      }
    />
  );
}

export interface MainChartProps {
  points: SeriesPoint[];
  showCorrected?: boolean;
}

/** Memoised: hovering only re-renders Recharts' own tooltip layer, never the page. */
export const MainChart = memo(function MainChart({
  points,
  showCorrected = false,
}: MainChartProps) {
  const drawIn = useDrawOnce();
  const rows = useMemo(() => toRows(points), [points]);
  const yTicks = useMemo(
    () =>
      niceTicks(
        0,
        extent(rows.flatMap((r) => [r.actual, r.forecast, showCorrected ? r.corrected : null]))[1],
      ),
    [rows, showCorrected],
  );
  const anim = {
    isAnimationActive: drawIn,
    animationDuration: DRAW_MS,
    animationEasing: "ease-out",
  } as const;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        aria-label="Line chart of hourly actual and forecast wind generation; use Show table for the numbers"
        role="img"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatDay}
          minTickGap={40}
          stroke={chart.axis}
          tickLine={false}
        />
        <YAxis
          ticks={yTicks}
          domain={[0, yTicks[yTicks.length - 1] ?? "auto"]}
          tickFormatter={formatGwTick}
          width={40}
          stroke={chart.axis}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<MainTooltip showCorrected={showCorrected} />}
          cursor={{ stroke: chart.muted, strokeWidth: 1, strokeDasharray: "3 3" }}
          isAnimationActive={false}
        />
        <Area
          dataKey="gap"
          stroke="none"
          fill={chart.gapFill}
          fillOpacity={1}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="actual"
          name="Actual"
          stroke={chart.actual}
          strokeWidth={2}
          dot={false}
          activeDot={activeDot}
          {...anim}
        />
        <Line
          dataKey="forecast"
          name="Forecast"
          stroke={chart.forecast}
          strokeWidth={2}
          dot={false}
          activeDot={activeDot}
          {...anim}
        />
        {showCorrected && (
          <Line
            dataKey="corrected"
            name="Bias-corrected"
            stroke={chart.corrected}
            strokeWidth={2}
            strokeDasharray={CORRECTED_DASH}
            dot={false}
            connectNulls={false}
            activeDot={activeDot}
            isAnimationActive={false}
          />
        )}
        <Brush
          dataKey="t"
          height={28}
          travellerWidth={8}
          tickFormatter={formatDay}
          stroke={chart.axis}
          fill={chart.raised}
          aria-label="Zoom: drag the handles to choose a time window"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});
