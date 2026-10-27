import type { BufferBasis, ErrorMetrics, MetricsResponse } from "../api/types";
import { formatMw, formatPct } from "./format";

/** The daily series drawn under a tile, from /metrics/by-day. */
export interface Spark {
  /** The exact statistic, used as the sparkline's visible label, tooltip and aria label. */
  label: string;
  pick: (m: ErrorMetrics) => number | null;
  signed?: boolean;
}

export interface Tile {
  label: string;
  value: string;
  /** The number behind `value`, for animated transitions; `format` turns it back into `value`. */
  raw: number | null;
  format: (v: number | null) => string;
  note: string;
  definition: string;
  spark: Spark;
  emphasis?: boolean;
}

const mw = (v: number | null) => formatMw(v);
const mwSigned = (v: number | null) => formatMw(v, { signed: true });

/** Appended to the definitions whose sparkline is a related, not identical, daily statistic. */
const wholePeriod = (spark: string) =>
  ` The headline number covers the whole period; the sparkline shows the ${spark.toLowerCase()} for each delivery day.`;

const DAILY_P90_SHORTFALL = "Daily P90 shortfall";
const DAILY_MAX_SHORTFALL = "Daily max shortfall";

export function buildTiles(m: MetricsResponse): Tile[] {
  const { metrics, insight } = m;
  const p = insight.percentile;
  const bias = metrics.bias_mw;
  const random = insight.basis === "random";
  return [
    {
      label: `Suggested buffer (P${p})`,
      value: formatMw(insight.buffer_mw),
      raw: insight.buffer_mw,
      format: mw,
      note: random
        ? `Random error only · ${formatPct(insight.coverage_vs_fuelhh)} of hours vs FUELHH`
        : `Covers ${formatPct(insight.achieved_coverage)} of hours`,
      definition:
        (random
          ? `The ${p}th percentile of (error − mean error) across all evaluated hours, floored at 0, where error = forecast − actual. It covers ${p}% of hour-to-hour variation but excludes the persistent offset.`
          : `The ${p}th percentile of hourly error (forecast − actual) across all evaluated hours, floored at 0. Planning on forecast − buffer would have covered actual wind in ${p}% of hours.`) +
        wholePeriod(DAILY_P90_SHORTFALL),
      spark: { label: DAILY_P90_SHORTFALL, pick: (d) => d.shortfall.p90_mw },
      emphasis: true,
    },
    {
      label: "Mean absolute error",
      value: formatMw(metrics.mae_mw),
      raw: metrics.mae_mw,
      format: mw,
      note: `Typical miss per hour · MAPE ${metrics.mape_pct === null ? "–" : `${metrics.mape_pct.toFixed(0)}%`}`,
      definition: `Mean of |forecast − actual| over all evaluated hours. MAPE is the mean of |error| ÷ actual, over hours with actual ≥ ${metrics.mape_min_actual_mw.toLocaleString("en-GB")} MW.`,
      spark: { label: "Daily MAE", pick: (d) => d.mae_mw },
    },
    {
      label: "RMSE",
      value: formatMw(metrics.rmse_mw),
      raw: metrics.rmse_mw,
      format: mw,
      note: "Weights large misses more heavily",
      definition:
        "Root mean squared error: the square root of the mean of (forecast − actual)² over all evaluated hours. Large misses count more than in MAE.",
      spark: { label: "Daily RMSE", pick: (d) => d.rmse_mw },
    },
    {
      label: "Bias",
      value: formatMw(bias, { signed: true }),
      raw: bias,
      format: mwSigned,
      note:
        bias === null
          ? "–"
          : bias > 0
            ? "Forecasts ran high on average"
            : bias < 0
              ? "Forecasts ran low on average"
              : "No average offset",
      definition:
        "Mean of (forecast − actual) over all evaluated hours. Positive means forecasts were above actual output on average.",
      spark: { label: "Daily bias (forecast − actual)", pick: (d) => d.bias_mw, signed: true },
    },
    {
      label: "Worst 1% of hours",
      value: formatMw(insight.worst_1pct_mw),
      raw: insight.worst_1pct_mw,
      format: mw,
      note: "Shortfall exceeded this in 1% of hours",
      definition:
        "The 99th percentile of hourly error (forecast − actual) across all evaluated hours, floored at 0: in 1% of hours wind fell short of the forecast by more than this. Same hours as the buffer." +
        wholePeriod(DAILY_MAX_SHORTFALL),
      spark: { label: DAILY_MAX_SHORTFALL, pick: (d) => d.shortfall.max_mw },
    },
  ];
}

/** Label for the buffer reference line on the error histogram. */
export function bufferLineLabel(bufferMw: number, basis: BufferBasis): string {
  return basis === "random"
    ? `random-only buffer ${formatMw(bufferMw)}`
    : `buffer incl. offset ${formatMw(bufferMw)}`;
}
