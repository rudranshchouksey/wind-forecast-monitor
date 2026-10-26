import type { MetricsResponse } from "../api/types";
import { formatHours, formatPct } from "../lib/format";
import { Skeleton } from "./states";

export function InsightCard({ data }: { data: MetricsResponse | undefined }) {
  if (!data) return <Skeleton className="h-36" />;
  const { insight, query, mean_horizon_h, coverage } = data;
  const basis =
    query.mode === "cutoff"
      ? `Forecasts available at ${query.cutoff_time} London the day before delivery (on average ${formatHours(mean_horizon_h)} ahead).`
      : `Forecasts made at least ${formatHours(query.horizon_h)} before each hour.`;
  return (
    <section
      aria-labelledby="insight-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 id="insight-heading" className="text-sm font-medium text-ink-2">
        Procurement takeaway
      </h2>
      <p className="mt-2 text-xl font-semibold text-balance text-ink">{insight.headline}</p>
      <p className="mt-2 text-sm text-ink-2">{insight.detail}</p>
      <p className="mt-2 text-xs text-muted">
        {basis} {coverage.evaluated.toLocaleString("en-GB")} of{" "}
        {coverage.expected_hours.toLocaleString("en-GB")} hours evaluated (
        {formatPct(coverage.ratio)}).
      </p>
      {insight.caveat && (
        <div
          role="note"
          className="mt-4 flex gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="currentColor"
          >
            <path d="M10 2 1 18h18L10 2Zm-1 6h2v5H9V8Zm0 6h2v2H9v-2Z" />
          </svg>
          <p>
            <strong className="font-semibold">Caveat: </strong>
            {insight.caveat}
          </p>
        </div>
      )}
    </section>
  );
}
