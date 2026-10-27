import type {
  BiasDiagnosticsResponse,
  CorrectionResponse,
  DistributionResponse,
  ErrorMetrics,
  GroupedResponse,
  HorizonResponse,
  MetaResponse,
  MetricsResponse,
  QueryEcho,
  SeriesResponse,
} from "../api/types";

export const query: QueryEcho = {
  from: "2026-01-02",
  to: "2026-01-03",
  mode: "cutoff",
  cutoff_time: "09:20",
  horizon_h: null,
};

export const meta: MetaResponse = {
  first_day: "2026-01-02",
  last_day: "2026-01-03",
  timezone: "Europe/London",
  default_cutoff_time: "09:20",
  cutoff_presets: [
    { label: "EPEX GB hourly (09:20)", time: "09:20", description: "" },
    { label: "Nord Pool N2EX (09:50)", time: "09:50", description: "" },
    { label: "Legacy 11:00", time: "11:00", description: "" },
  ],
  max_horizon_h: 72,
  default_horizons: [1, 24],
  default_percentile: 90,
  alignment: "hour_mean",
  mape_min_actual_mw: 1000,
};

export const errorMetrics: ErrorMetrics = {
  n: 48,
  mae_mw: 2038.9,
  rmse_mw: 2504.8,
  bias_mw: 1747.9,
  mape_pct: 22.0,
  mape_n: 48,
  mape_min_actual_mw: 1000,
  abs_p50_mw: 1671,
  abs_p90_mw: 4097.9,
  abs_p99_mw: 6261.3,
  shortfall: {
    n: 41,
    share: 0.85,
    mean_mw: 2229,
    p50_mw: 1868,
    p90_mw: 4377.3,
    p99_mw: 6357,
    max_mw: 6870,
  },
  surplus: {
    n: 7,
    share: 0.15,
    mean_mw: 967,
    p50_mw: 824,
    p90_mw: 1991,
    p99_mw: 3201,
    max_mw: 3550,
  },
};

export const metrics: MetricsResponse = {
  query,
  metrics: errorMetrics,
  coverage: { expected_hours: 48, with_forecast: 48, with_actual: 48, evaluated: 48, ratio: 1 },
  insight: {
    percentile: 90,
    basis: "total",
    n: 48,
    buffer_mw: 4097.9,
    achieved_coverage: 0.9,
    coverage_vs_fuelhh: 0.9,
    offset_mw: 1747.9,
    random_component_mw: 2350,
    worst_1pct_mw: 6261.3,
    headline:
      "To cover wind under-delivery in 90% of hours, plan on 4,098 MW less wind than the forecast.",
    detail: "Based on 48 hours.",
    caveat: "Most of this buffer is a persistent offset.",
  },
  mean_horizon_h: 28,
};

export const series: SeriesResponse = {
  query,
  coverage: metrics.coverage,
  points: [
    {
      target_time: "2026-01-02T00:00:00Z",
      actual_mw: 9000,
      forecast_mw: 10000,
      error_mw: 1000,
      publish_time: "2026-01-01T07:30:00Z",
      horizon_h: 16.5,
      corrected_mw: 9200,
    },
  ],
};

export const byHorizon: HorizonResponse = {
  query,
  rows: [
    { horizon_h: 1, metrics: errorMetrics, coverage: metrics.coverage },
    { horizon_h: 24, metrics: errorMetrics, coverage: metrics.coverage },
  ],
  reference: { horizon_h: 28, metrics: errorMetrics, coverage: metrics.coverage },
};

export const byHour: GroupedResponse = {
  query,
  group_by: "hour",
  rows: [{ key: "0", metrics: errorMetrics }],
};

export const byDay: GroupedResponse = {
  query,
  group_by: "day",
  rows: [
    { key: "2026-01-02", metrics: errorMetrics },
    {
      key: "2026-01-03",
      metrics: { ...errorMetrics, mae_mw: 1800, bias_mw: -200, rmse_mw: 2100 },
    },
  ],
};

export const distribution: DistributionResponse = {
  query,
  n: 48,
  bin_width_mw: 500,
  bins: [
    { lower_mw: -500, upper_mw: 0, count: 8 },
    { lower_mw: 0, upper_mw: 500, count: 40 },
  ],
  quantiles: { p90: 4000 },
};

export const bias: BiasDiagnosticsResponse = {
  query,
  overall_bias_mw: 1747.9,
  bias_at_zero_horizon_mw: 1473.1,
  hindcast: {
    label: "hours already ended (0-3 h before publish)",
    n: 744,
    bias_mw: 1524.5,
    mean_ratio: 0.89,
  },
  by_forecast_level: [
    { label: "0-5 GW", n: 31, bias_mw: 539, mean_ratio: 0.86 },
    { label: "15-30 GW", n: 298, bias_mw: 2683, mean_ratio: 0.86 },
  ],
  by_actual_level: [
    { label: "0-5 GW", n: 62, bias_mw: 2150, mean_ratio: 0.7 },
    { label: "15-30 GW", n: 190, bias_mw: 2130, mean_ratio: 0.9 },
  ],
  hindcast_by_level: [
    { label: "0-5 GW", n: 43, bias_mw: 448, mean_ratio: 0.88 },
    { label: "15-30 GW", n: 300, bias_mw: 2670, mean_ratio: 0.86 },
  ],
  hindcast_by_actual_level: [
    { label: "0-5 GW", n: 65, bias_mw: 844, mean_ratio: 0.8 },
    { label: "15-30 GW", n: 181, bias_mw: 2244, mean_ratio: 0.9 },
  ],
};

export const correction: CorrectionResponse = {
  query,
  method: "OLS actual = a * forecast + b",
  window_days: 7,
  days_total: 2,
  days_corrected: 2,
  raw: errorMetrics,
  corrected: { ...errorMetrics, mae_mw: 1568, rmse_mw: 2017, bias_mw: 449 },
  mae_change_pct: -23.1,
  rmse_change_pct: -19.47,
  latest_fit: {
    day: "2026-01-03",
    slope: 1.04,
    intercept: -3175,
    train_hours: 168,
    train_first_day: "2025-12-26",
    train_last_day: "2026-01-01",
  },
};

/** fetch mock routing by path; unknown paths return 404 problem JSON. */
export function mockApi(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, unknown> = {
    "/meta": meta,
    "/metrics": metrics,
    "/forecast-vs-actual": series,
    "/metrics/by-horizon": byHorizon,
    "/metrics/by-hour": byHour,
    "/metrics/by-day": byDay,
    "/error-distribution": distribution,
    "/diagnostics/bias": bias,
    "/metrics/correction": correction,
  };
  return (input: RequestInfo | URL): Promise<Response> => {
    const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    const url = new URL(raw, "http://localhost");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const override = overrides[path];
    if (override) return Promise.resolve(override());
    const body = routes[path];
    if (body === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ title: "Not Found", status: 404 }), { status: 404 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
}
