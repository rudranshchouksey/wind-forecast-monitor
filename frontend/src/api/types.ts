// Mirrors backend/app/models/api.py (the OpenAPI contract at /api/v1/openapi.json).

export type Mode = "cutoff" | "horizon";

export interface QueryEcho {
  from: string;
  to: string;
  mode: Mode;
  cutoff_time: string;
  horizon_h: number | null;
}

export interface Coverage {
  expected_hours: number;
  with_forecast: number;
  with_actual: number;
  evaluated: number;
  ratio: number;
}

export interface DirectionalStats {
  n: number;
  share: number | null;
  mean_mw: number | null;
  p50_mw: number | null;
  p90_mw: number | null;
  p99_mw: number | null;
  max_mw: number | null;
}

export interface ErrorMetrics {
  n: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  mape_pct: number | null;
  mape_n: number;
  mape_min_actual_mw: number;
  abs_p50_mw: number | null;
  abs_p90_mw: number | null;
  abs_p99_mw: number | null;
  shortfall: DirectionalStats;
  surplus: DirectionalStats;
}

export interface Insight {
  percentile: number;
  n: number;
  buffer_mw: number | null;
  achieved_coverage: number | null;
  offset_mw: number | null;
  random_component_mw: number | null;
  headline: string;
  detail: string;
  caveat: string | null;
}

export interface MetricsResponse {
  query: QueryEcho;
  metrics: ErrorMetrics;
  coverage: Coverage;
  insight: Insight;
  mean_horizon_h: number | null;
}

export interface SeriesPoint {
  target_time: string;
  actual_mw: number;
  forecast_mw: number;
  error_mw: number;
  publish_time: string;
  horizon_h: number;
}

export interface SeriesResponse {
  query: QueryEcho;
  coverage: Coverage;
  points: SeriesPoint[];
}

export interface HorizonRow {
  horizon_h: number;
  metrics: ErrorMetrics;
  coverage: Coverage;
}

export interface HorizonResponse {
  query: QueryEcho;
  rows: HorizonRow[];
  reference: HorizonRow;
}

export interface GroupRow {
  key: string;
  metrics: ErrorMetrics;
}

export interface GroupedResponse {
  query: QueryEcho;
  group_by: "hour" | "day";
  rows: GroupRow[];
}

export interface HistogramBin {
  lower_mw: number;
  upper_mw: number;
  count: number;
}

export interface DistributionResponse {
  query: QueryEcho;
  n: number;
  bin_width_mw: number;
  bins: HistogramBin[];
  quantiles: Record<string, number>;
}

export interface BiasBucket {
  label: string;
  n: number;
  bias_mw: number | null;
  mean_ratio: number | null;
}

export interface BiasDiagnosticsResponse {
  query: QueryEcho;
  overall_bias_mw: number | null;
  bias_at_zero_horizon_mw: number | null;
  hindcast: BiasBucket;
  by_forecast_level: BiasBucket[];
}

export interface CutoffPreset {
  label: string;
  time: string;
  description: string;
}

export interface MetaResponse {
  first_day: string;
  last_day: string;
  timezone: string;
  default_cutoff_time: string;
  cutoff_presets: CutoffPreset[];
  max_horizon_h: number;
  default_horizons: number[];
  default_percentile: number;
  alignment: string;
  mape_min_actual_mw: number;
}

export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail?: string;
}
