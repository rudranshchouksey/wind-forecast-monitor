// Table views ("Show table") need no Recharts, so they stay in the initial bundle.
import type { DistributionResponse, GroupRow, HorizonResponse, SeriesPoint } from "../../api/types";
import { formatHours, formatLondon, formatMw, formatPct } from "../../lib/format";
import { DataTable } from "../ChartCard";

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
