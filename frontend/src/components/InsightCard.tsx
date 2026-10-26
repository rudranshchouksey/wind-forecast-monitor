import type { BiasDiagnosticsResponse, MetricsResponse } from "../api/types";
import { formatDeliveryDay, formatHours, formatMw, formatPct } from "../lib/format";
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

export function BiasNote({ data }: { data: BiasDiagnosticsResponse | undefined }) {
  if (!data) return null;
  const rows: [string, string][] = [
    [
      "All hours at the selected cutoff/lead time",
      formatMw(data.overall_bias_mw, { signed: true }),
    ],
    ["Forecast made 0 h before the hour", formatMw(data.bias_at_zero_horizon_mw, { signed: true })],
    [
      `WINDFOR values for ${data.hindcast.label}`,
      formatMw(data.hindcast.bias_mw, { signed: true }),
    ],
    ...data.by_forecast_level.map((b): [string, string] => [
      `Forecast level ${b.label} (${b.n} h)`,
      formatMw(b.bias_mw, { signed: true }),
    ]),
  ];
  return (
    <details className="group rounded-xl border border-line bg-surface p-5">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        Is the bias forecast error? (diagnostics)
      </summary>
      <p className="mt-3 text-sm text-ink-2">
        If the gap were forecasting skill, it would shrink as the forecast gets closer to real time.
        It barely does, and WINDFOR stays above FUELHH even for hours that had already ended when it
        was published. That points to a persistent difference between the two series, not weather
        uncertainty. Elexon&apos;s documentation doesn&apos;t explain it; see docs/analysis.md.
      </p>
      <table className="tabular mt-3 w-full text-sm">
        <caption className="sr-only">Mean forecast minus actual under different conditions</caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
                {k}
              </th>
              <td className="py-1.5 text-right font-medium text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Delivery days {formatDeliveryDay(data.query.from)} to {formatDeliveryDay(data.query.to)}.
      </p>
    </details>
  );
}
