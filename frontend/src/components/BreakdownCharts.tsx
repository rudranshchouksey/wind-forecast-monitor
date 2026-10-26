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

import type { DistributionResponse, GroupRow, HorizonResponse, HorizonRow } from "../api/types";
import {
  formatDeliveryDay,
  formatGwTick,
  formatHourOfDay,
  formatHours,
  formatMw,
  formatPct,
} from "../lib/format";
import { DataTable, Legend } from "./ChartCard";
import { TooltipBox } from "./ChartTooltip";
import { DataEndBar } from "./DataEndBar";
import { extent, niceTicks } from "../lib/ticks";

const axisProps = { stroke: "var(--axis)", tickLine: false } as const;
const yAxisProps = {
  ...axisProps,
  axisLine: false,
  width: 44,
  tickFormatter: formatGwTick,
} as const;
function yScale(values: (number | null)[]) {
  const [lo, hi] = extent(values);
  const ticks = niceTicks(Math.min(0, lo), Math.max(0, hi));
  return { ticks, domain: [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0] as [number, number] };
}

const signColor = (v: number) => (v > 0 ? "var(--shortfall)" : "var(--surplus)");

export function SignLegend() {
  return (
    <Legend
      items={[
        { label: "Forecast above actual (shortfall)", color: "var(--shortfall)", kind: "box" },
        { label: "Forecast below actual (surplus)", color: "var(--surplus)", kind: "box" },
      ]}
    />
  );
}

// -- by horizon --------------------------------------------------------------------------------

export function HorizonLegend() {
  return (
    <Legend
      items={[
        { label: "Mean absolute error", color: "var(--series-actual)" },
        { label: "P90 shortfall", color: "var(--series-forecast)" },
      ]}
    />
  );
}

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
        { label: "mean absolute error", value: formatMw(p.mae), color: "var(--series-actual)" },
        { label: "P90 shortfall", value: formatMw(p.p90), color: "var(--series-forecast)" },
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

export function HorizonChart({
  data,
  selectedH,
}: {
  data: HorizonResponse;
  selectedH: number | null;
}) {
  const points = data.rows.map(toHorizonPoint);
  const ref = data.reference;
  const y = yScale(points.flatMap((p) => [p.mae, p.p90]));
  const maxH = Math.max(...points.map((p) => p.h), 0);
  const xTicks = [0, 6, 12, 18, 24, 36, 48, 60, 72].filter((t) => t <= maxH);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
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
        <Tooltip content={<HorizonTooltip />} cursor={{ stroke: "var(--axis)" }} />
        {selectedH !== null && (
          <ReferenceLine
            x={selectedH}
            stroke="var(--ink-muted)"
            strokeDasharray="0"
            label={{ value: "selected", position: "top", fill: "var(--ink-muted)", fontSize: 11 }}
          />
        )}
        <Line
          dataKey="mae"
          stroke="var(--series-actual)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--series-actual)", stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          dataKey="p90"
          stroke="var(--series-forecast)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--series-forecast)", stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {ref.metrics.mae_mw !== null && (
          <ReferenceDot
            x={ref.horizon_h}
            y={ref.metrics.mae_mw}
            r={6}
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth={2}
            label={{ value: "at cutoff", position: "bottom", fill: "var(--ink-2)", fontSize: 11 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HorizonTable({ data }: { data: HorizonResponse }) {
  return (
    <DataTable
      caption="Forecast error by lead time"
      columns={["Lead time", "MAE", "RMSE", "Bias", "P90 shortfall", "Hours covered"]}
      rows={data.rows.map((r) => [
        formatHours(r.horizon_h),
        formatMw(r.metrics.mae_mw),
        formatMw(r.metrics.rmse_mw),
        formatMw(r.metrics.bias_mw, { signed: true }),
        formatMw(r.metrics.shortfall.p90_mw),
        `${r.coverage.evaluated} (${formatPct(r.coverage.ratio)})`,
      ])}
    />
  );
}

// -- by hour of day ----------------------------------------------------------------------------

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

export function HourChart({ rows }: { rows: GroupRow[] }) {
  const points = rows.map(toGroupPoint);
  const y = yScale(points.map((p) => p.mae));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="key" tickFormatter={formatHourOfDay} interval={2} {...axisProps} />
        <YAxis {...yAxisProps} ticks={y.ticks} domain={y.domain} />
        <Tooltip
          content={<GroupTooltip title={(k) => `${formatHourOfDay(k)} (London)`} />}
          cursor={{ fill: "var(--surface-2)" }}
        />
        <Bar
          dataKey="mae"
          fill="var(--series-actual)"
          maxBarSize={24}
          shape={<DataEndBar />}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupTable({
  rows,
  keyLabel,
  formatKey,
}: {
  rows: GroupRow[];
  keyLabel: string;
  formatKey: (k: string) => string;
}) {
  return (
    <DataTable
      caption={`Forecast error by ${keyLabel.toLowerCase()}`}
      columns={[keyLabel, "MAE", "Bias", "P90 shortfall", "Hours"]}
      rows={rows.map((g) => [
        formatKey(g.key),
        formatMw(g.metrics.mae_mw),
        formatMw(g.metrics.bias_mw, { signed: true }),
        formatMw(g.metrics.shortfall.p90_mw),
        g.metrics.n,
      ])}
    />
  );
}

// -- by day ------------------------------------------------------------------------------------

export function DayChart({ rows }: { rows: GroupRow[] }) {
  const points = rows.map(toGroupPoint);
  const y = yScale(points.map((p) => p.bias));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="key"
          tickFormatter={(k: string) => formatDeliveryDay(k).split(" ").slice(1).join(" ")}
          minTickGap={16}
          {...axisProps}
        />
        <YAxis {...yAxisProps} ticks={y.ticks} domain={y.domain} />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          content={<GroupTooltip title={formatDeliveryDay} />}
          cursor={{ fill: "var(--surface-2)" }}
        />
        <Bar dataKey="bias" maxBarSize={24} shape={<DataEndBar />} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={signColor(p.bias ?? 0)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

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

export function Histogram({
  data,
  bufferMw,
}: {
  data: DistributionResponse;
  bufferMw: number | null;
}) {
  const points: BinPoint[] = data.bins.map((b) => ({
    mid: (b.lower_mw + b.upper_mw) / 2,
    lower: b.lower_mw,
    upper: b.upper_mw,
    count: b.count,
    share: data.n ? b.count / data.n : 0,
  }));
  const edges = data.bins.flatMap((b) => [b.lower_mw, b.upper_mw]);
  const xTicks = niceTicks(Math.min(...edges), Math.max(...edges), 6);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={points}
        margin={{ top: 16, right: 12, bottom: 4, left: 0 }}
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
            fill: "var(--ink-muted)",
            fontSize: 11,
          }}
        />
        <YAxis {...axisProps} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip content={<BinTooltip />} cursor={{ fill: "var(--surface-2)" }} />
        <ReferenceLine x={0} stroke="var(--axis)" />
        {bufferMw !== null && (
          <ReferenceLine
            x={bufferMw}
            stroke="var(--ink)"
            strokeWidth={1.5}
            label={{
              value: `buffer ${formatMw(bufferMw)}`,
              position: "top",
              fill: "var(--ink)",
              fontSize: 11,
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
}

export function HistogramTable({ data }: { data: DistributionResponse }) {
  return (
    <DataTable
      caption="Distribution of forecast error"
      columns={["Error range", "Hours", "Share"]}
      rows={data.bins.map((b) => [
        `${formatMw(b.lower_mw, { signed: true })} to ${formatMw(b.upper_mw, { signed: true })}`,
        b.count,
        formatPct(data.n ? b.count / data.n : 0),
      ])}
    />
  );
}
