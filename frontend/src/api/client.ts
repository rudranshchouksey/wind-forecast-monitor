import type {
  BiasDiagnosticsResponse,
  DistributionResponse,
  GroupedResponse,
  HorizonResponse,
  MetaResponse,
  MetricsResponse,
  Mode,
  ProblemDetail,
  SeriesResponse,
} from "./types";

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "/api/v1";

export interface AnalysisParams {
  from: string;
  to: string;
  mode: Mode;
  cutoffTime: string;
  horizonH: number;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Query = Record<string, string | number | undefined>;

export function toQuery(p: AnalysisParams, extra: Query = {}): string {
  const q = new URLSearchParams({
    from: p.from,
    to: p.to,
    mode: p.mode,
    cutoff_time: p.cutoffTime,
  });
  if (p.mode === "horizon") q.set("horizon_h", String(p.horizonH));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) q.set(k, String(v));
  return q.toString();
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as Partial<ProblemDetail>;
      message = body.detail ?? body.title ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<MetaResponse>("/meta", signal),
  metrics: (p: AnalysisParams, percentile: number, signal?: AbortSignal) =>
    getJson<MetricsResponse>(`/metrics?${toQuery(p, { percentile })}`, signal),
  series: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<SeriesResponse>(`/forecast-vs-actual?${toQuery(p)}`, signal),
  byHorizon: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<HorizonResponse>(`/metrics/by-horizon?${toQuery(p)}`, signal),
  byHour: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<GroupedResponse>(`/metrics/by-hour?${toQuery(p)}`, signal),
  byDay: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<GroupedResponse>(`/metrics/by-day?${toQuery(p)}`, signal),
  distribution: (p: AnalysisParams, binMw: number, signal?: AbortSignal) =>
    getJson<DistributionResponse>(`/error-distribution?${toQuery(p, { bin_mw: binMw })}`, signal),
  bias: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<BiasDiagnosticsResponse>(`/diagnostics/bias?${toQuery(p)}`, signal),
};

export function csvUrl(p: AnalysisParams): string {
  return `${API_BASE}/forecast-vs-actual?${toQuery(p, { format: "csv" })}`;
}
