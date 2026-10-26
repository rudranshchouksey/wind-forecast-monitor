import type {
  BiasDiagnosticsResponse,
  BufferBasis,
  CorrectionResponse,
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

export const UNREACHABLE_MESSAGE =
  "Can't reach the API. Is the backend running on :8000? See README › Quick start.";

/** Statuses a dev proxy or gateway returns when nothing answers behind it. */
const GATEWAY_STATUSES = new Set([500, 502, 503, 504]);

export class ApiError extends Error {
  readonly status: number;
  /** No API answered: a network failure, or a gateway error without a problem+json body. */
  readonly unreachable: boolean;
  /** The problem+json title, when the API sent one. */
  readonly title: string | undefined;
  constructor(
    status: number,
    message: string,
    options: { unreachable?: boolean; title?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.unreachable = options.unreachable ?? false;
    this.title = options.title;
  }
}

export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.unreachable;
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

/** The problem+json body of an API error, or null if the body isn't one (e.g. a proxy's empty 500). */
async function readProblem(res: Response): Promise<Partial<ProblemDetail> | null> {
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && ("title" in body || "detail" in body)) {
      return body as Partial<ProblemDetail>;
    }
  } catch {
    /* non-JSON error body */
  }
  return null;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, UNREACHABLE_MESSAGE, { unreachable: true });
  }
  if (!res.ok) {
    const problem = await readProblem(res);
    if (problem) {
      const message = problem.detail ?? problem.title ?? `Request failed (${res.status})`;
      throw new ApiError(res.status, message, { title: problem.title });
    }
    if (GATEWAY_STATUSES.has(res.status)) {
      throw new ApiError(res.status, UNREACHABLE_MESSAGE, { unreachable: true });
    }
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<MetaResponse>("/meta", signal),
  metrics: (p: AnalysisParams, percentile: number, basis: BufferBasis, signal?: AbortSignal) =>
    getJson<MetricsResponse>(`/metrics?${toQuery(p, { percentile, buffer_basis: basis })}`, signal),
  correction: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<CorrectionResponse>(`/metrics/correction?${toQuery(p)}`, signal),
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
