import { useMemo } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { SeriesPoint } from "../api/types";
import { formatDay, formatGwTick, formatHours, formatLondon, formatMw } from "../lib/format";
import { extent, niceTicks } from "../lib/ticks";
import { DataTable, Legend } from "./ChartCard";
import { TooltipBox } from "./ChartTooltip";

interface Row {
  t: number;
  actual: number;
  forecast: number;
  corrected: number | null;
  error: number;
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
    publish: p.publish_time,
    horizon: p.horizon_h,
  }));
}

// Derived series: dashed as well as coloured, so it never relies on hue alone.
const CORRECTED_DASH = "6 3";

export function MainLegend({ showCorrected = false }: { showCorrected?: boolean }) {
  return (
    <Legend
      items={[
        { label: "Actual (FUELHH, hourly mean)", color: "var(--series-actual)" },
        { label: "Forecast available at decision time (WINDFOR)", color: "var(--series-forecast)" },
        ...(showCorrected
          ? [
              {
                label: "Bias-corrected forecast",
                color: "var(--series-corrected)",
                kind: "dash" as const,
              },
            ]
          : []),
      ]}
    />
  );
}

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
        { label: "actual", value: formatMw(row.actual), color: "var(--series-actual)" },
        { label: "forecast", value: formatMw(row.forecast), color: "var(--series-forecast)" },
        ...(showCorrected
          ? [
              {
                label: "bias-corrected",
                value: formatMw(row.corrected),
                color: "var(--series-corrected)",
              },
            ]
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

export function MainChart({
  points,
  showCorrected = false,
}: {
  points: SeriesPoint[];
  showCorrected?: boolean;
}) {
  const rows = useMemo(() => toRows(points), [points]);
  const yTicks = useMemo(
    () =>
      niceTicks(
        0,
        extent(rows.flatMap((r) => [r.actual, r.forecast, showCorrected ? r.corrected : null]))[1],
      ),
    [rows, showCorrected],
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatDay}
          minTickGap={40}
          stroke="var(--axis)"
          tickLine={false}
        />
        <YAxis
          ticks={yTicks}
          domain={[0, yTicks[yTicks.length - 1] ?? "auto"]}
          tickFormatter={formatGwTick}
          width={44}
          stroke="var(--axis)"
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<MainTooltip showCorrected={showCorrected} />}
          cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
        />
        <Line
          dataKey="actual"
          name="Actual"
          stroke="var(--series-actual)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          dataKey="forecast"
          name="Forecast"
          stroke="var(--series-forecast)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {showCorrected && (
          <Line
            dataKey="corrected"
            name="Bias-corrected"
            stroke="var(--series-corrected)"
            strokeWidth={2}
            strokeDasharray={CORRECTED_DASH}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        )}
        <Brush
          dataKey="t"
          height={28}
          travellerWidth={8}
          tickFormatter={formatDay}
          stroke="var(--axis)"
          fill="var(--surface)"
          aria-label="Zoom: drag the handles to choose a time window"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MainTable({ points }: { points: SeriesPoint[] }) {
  const hasCorrected = points.some((p) => p.corrected_mw !== null);
  return (
    <DataTable
      caption="Hourly actual and forecast wind generation"
      columns={[
        "Time (London)",
        "Actual",
        "Forecast",
        ...(hasCorrected ? ["Bias-corrected"] : []),
        "Error",
        "Published",
        "Lead time",
      ]}
      rows={points.map((p) => [
        formatLondon(p.target_time),
        formatMw(p.actual_mw),
        formatMw(p.forecast_mw),
        ...(hasCorrected ? [formatMw(p.corrected_mw)] : []),
        formatMw(p.error_mw, { signed: true }),
        formatLondon(p.publish_time),
        formatHours(p.horizon_h),
      ])}
    />
  );
}
