import type { MetricsResponse } from "../api/types";
import { formatMw, formatPct } from "./format";

export interface Tile {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
}

export function buildTiles(m: MetricsResponse): Tile[] {
  const { metrics, insight } = m;
  const bias = metrics.bias_mw;
  return [
    {
      label: "Suggested buffer",
      value: formatMw(insight.buffer_mw),
      note: `Covers ${formatPct(insight.achieved_coverage)} of hours (P${insight.percentile})`,
      emphasis: true,
    },
    {
      label: "Mean absolute error",
      value: formatMw(metrics.mae_mw),
      note: `Typical miss per hour · MAPE ${metrics.mape_pct === null ? "–" : `${metrics.mape_pct.toFixed(0)}%`}`,
    },
    {
      label: "RMSE",
      value: formatMw(metrics.rmse_mw),
      note: "Weights large misses more heavily",
    },
    {
      label: "Bias",
      value: formatMw(bias, { signed: true }),
      note:
        bias === null
          ? "–"
          : bias > 0
            ? "Forecasts ran high on average"
            : bias < 0
              ? "Forecasts ran low on average"
              : "No average offset",
    },
    {
      label: "P90 shortfall",
      value: formatMw(metrics.shortfall.p90_mw),
      note: `Shortfall in ${formatPct(metrics.shortfall.share)} of hours`,
    },
  ];
}
