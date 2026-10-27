import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type {
  BufferBasis,
  DistributionResponse,
  GroupRow,
  HorizonResponse,
  HorizonRow,
} from "../../api/types";
import {
  formatDeliveryDay,
  formatGwTick,
  formatHourOfDay,
  formatHours,
  formatMw,
  formatPct,
} from "../../lib/format";
import { bufferLineLabel } from "../../lib/kpis";
import { chart } from "../../lib/theme";
import { extent, niceTicks } from "../../lib/ticks";
import { TooltipBox } from "../ChartTooltip";
import { DataEndBar } from "../DataEndBar";
import { DRAW_MS, useDrawOnce } from "./drawIn";

const axisProps = { stroke: chart.axis, tickLine: false } as const;
const yAxisProps = {
  ...axisProps,
  axisLine: false,
  width: 40,
  tickFormatter: formatGwTick,
} as const;
const barCursor = { fill: chart.raised, fillOpacity: 0.7 } as const;
const refLabel = { fill: chart.text2, fontSize: 11, fontFamily: "var(--font-mono)" } as const;

function yScale(values: (number | null)[]) {
  const [lo, hi] = extent(values);
  const ticks = niceTicks(Math.min(0, lo), Math.max(0, hi));
  return { ticks, domain: [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0] as [number, number] };
}

const signColor = (v: number) => (v > 0 ? chart.shortfall : chart.surplus);

// -- by horizon --------------------------------------------------------------------------------

interface HorizonPoint {
  h: number;
  mae: number | null;
  p90: number | null;
  coverage: number;
}

function HorizonTooltip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as HorizonPoint | undefined;
  if (!active || !p) return null;
  return (
    <TooltipBox
      title={`Forecast made ${formatHours(p.h)} ahead`}
      rows={[
        { label: "mean absolute error", value: formatMw(p.mae), color: chart.actual },
        { label: "P90 shortfall", value: formatMw(p.p90), color: chart.forecast },
      ]}
      footer={
        p.coverage < 0.99
          ? `Covers ${formatPct(p.coverage)} of hours (lead time near the data limit)`
          : undefined
      }
    />
  );
}

const toHorizonPoint = (r: HorizonRow): HorizonPoint => ({
  h: r.horizon_h,
  mae: r.metrics.mae_mw,
  p90: r.metrics.shortfall.p90_mw,
  coverage: r.coverage.ratio,
});

export const HorizonChart = memo(function HorizonChart({
  data,
  selectedH,
}: {
  data: HorizonResponse;
  selectedH: number | null;
}) {
  const drawIn = useDrawOnce();
  const points = useMemo(() => data.rows.map(toHorizonPoint), [data]);
  const ref = data.reference;
  const y = useMemo(() => yScale(points.flatMap((p) => [p.mae, p.p90])), [points]);
  const maxH = Math.max(...points.map((p) => p.h), 0);
  const xTicks = [0, 6, 12, 18, 24, 36, 48, 60, 72].filter((t) => t <= maxH);
  const line = { strokeWidth: 2, isAnimationActive: drawIn, animationDuration: DRAW_MS } as const;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="h"
          type="number"
          domain={[0, "dataMax"]}
          ticks={xTicks}
          tickFormatter={(v: number) => `${v}h`}
          {...axisProps}
        />
        <YAxis {...yAxisProps} ticks={y.ticks} domain={y.domain} />
        <Tooltip
          content={<HorizonTooltip />}
          cursor={{ stroke: chart.muted, strokeDasharray: "3 3" }}
          isAnimationActive={false}
        />
        {selectedH !== null && (
          <ReferenceLine
            x={selectedH}
            stroke={chart.accent}
            strokeDasharray="0"
            label={{ ...refLabel, value: "selected", position: "top", fill: chart.accent }}
          />
        )}
        <Line
          dataKey="mae"
          stroke={chart.actual}
          dot={{ r: 3.5, fill: chart.actual, stroke: chart.panel, strokeWidth: 2 }}
          {...line}
        />
        <Line
          dataKey="p90"
          stroke={chart.forecast}
          dot={{ r: 3.5, fill: chart.forecast, stroke: chart.panel, strokeWidth: 2 }}
          {...line}
        />
        {ref.metrics.mae_mw !== null && (
          <ReferenceDot
            x={ref.horizon_h}
            y={ref.metrics.mae_mw}
            r={6}
            fill={chart.panel}
            stroke={chart.text}
            strokeWidth={2}
            label={{ ...refLabel, value: "at cutoff", position: "bottom" }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
});

// -- by hour of day / by day -------------------------------------------------------------------

interface GroupPoint {
  key: string;
  mae: number | null;
  bias: number | null;
  p90: number | null;
  n: number;
}

const toGroupPoint = (g: GroupRow): GroupPoint => ({
  key: g.key,
  mae: g.metrics.mae_mw,
  bias: g.metrics.bias_mw,
  p90: g.metrics.shortfall.p90_mw,
  n: g.metrics.n,
});

function GroupTooltip({
  active,
  payload,
  title,
}: TooltipProps<number, string> & { title: (k: string) => string }) {
  const p = payload?.[0]?.payload as GroupPoint | undefined;
  if (!active || !p) return null;
  return (
    <TooltipBox
      title={title(p.key)}
      rows={[
        { label: "mean absolute error", value: formatMw(p.mae) },
        { label: "bias (forecast − actual)", value: formatMw(p.bias, { signed: true }) },
        { label: "P90 shortfall", value: formatMw(p.p90) },
      ]}
      footer={`${p.n} hours`}
    />
  );
}

const hourTitle = (k: string) => `${formatHourOfDay(k)} (London)`;

export const HourChart = memo(function HourChart({ rows }: { rows: GroupRow[] }) {
  const points = useMemo(() => rows.map(toGroupPoint), [rows]);
  const y = useMemo(() => yScale(points.map((p) => p.mae)), [points]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickFormatter={formatHourOfDay} interval={2} {...axisProps} />
        <YAxis {...yAxisProps} ticks={y.ticks} domain={y.domain} />
        <Tooltip
          content={<GroupTooltip title={hourTitle} />}
          cursor={barCursor}
          isAnimationActive={false}
        />
        <Bar
          dataKey="mae"
          fill={chart.actual}
          maxBarSize={24}
          shape={<DataEndBar />}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

const shortDay = (k: string) => formatDeliveryDay(k).split(" ").slice(1).join(" ");

export const DayChart = memo(function DayChart({ rows }: { rows: GroupRow[] }) {
  const points = useMemo(() => rows.map(toGroupPoint), [rows]);
  const y = useMemo(() => yScale(points.map((p) => p.bias)), [points]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickFormatter={shortDay} minTickGap={16} {...axisProps} />
        <YAxis {...yAxisProps} ticks={y.ticks} domain={y.domain} />
        <ReferenceLine y={0} stroke={chart.axis} />
        <Tooltip
          content={<GroupTooltip title={formatDeliveryDay} />}
          cursor={barCursor}
          isAnimationActive={false}
        />
        <Bar dataKey="bias" maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={signColor(p.bias ?? 0)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

// -- histogram ---------------------------------------------------------------------------------

interface BinPoint {
  mid: number;
  lower: number;
  upper: number;
  count: number;
  share: number;
}

function BinTooltip({ active, payload }: TooltipProps<number, string>) {
  const b = payload?.[0]?.payload as BinPoint | undefined;
  if (!active || !b) return null;
  return (
    <TooltipBox
      title={`${formatMw(b.lower, { signed: true })} to ${formatMw(b.upper, { signed: true })}`}
      rows={[
        { label: "hours", value: String(b.count) },
        { label: "of all hours", value: formatPct(b.share) },
      ]}
    />
  );
}

export const Histogram = memo(function Histogram({
  data,
  bufferMw,
  basis = "total",
}: {
  data: DistributionResponse;
  bufferMw: number | null;
  basis?: BufferBasis;
}) {
  const points = useMemo(
    (): BinPoint[] =>
      data.bins.map((b) => ({
        mid: (b.lower_mw + b.upper_mw) / 2,
        lower: b.lower_mw,
        upper: b.upper_mw,
        count: b.count,
        share: data.n ? b.count / data.n : 0,
      })),
    [data],
  );
  const xTicks = useMemo(() => {
    const edges = data.bins.flatMap((b) => [b.lower_mw, b.upper_mw]);
    return niceTicks(Math.min(...edges), Math.max(...edges), 6);
  }, [data]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={points}
        margin={{ top: 20, right: 12, bottom: 4, left: 0 }}
        barCategoryGap={2}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="mid"
          type="number"
          domain={[xTicks[0] ?? "auto", xTicks[xTicks.length - 1] ?? "auto"]}
          ticks={xTicks}
          tickFormatter={formatGwTick}
          {...axisProps}
          label={{
            value: "GW error",
            position: "insideBottomRight",
            offset: -2,
            fill: chart.muted,
            fontSize: 11,
          }}
        />
        <YAxis {...axisProps} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip content={<BinTooltip />} cursor={barCursor} isAnimationActive={false} />
        <ReferenceLine x={0} stroke={chart.axis} />
        {bufferMw !== null && (
          <ReferenceLine
            x={bufferMw}
            stroke={chart.text}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              ...refLabel,
              value: bufferLineLabel(bufferMw, basis),
              position: "top",
              fill: chart.text,
            }}
          />
        )}
        <Bar dataKey="count" shape={<DataEndBar />} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.mid} fill={signColor(p.mid)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});
