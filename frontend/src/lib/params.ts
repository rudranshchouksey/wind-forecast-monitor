import type { AnalysisParams } from "../api/client";
import type { MetaResponse } from "../api/types";

export function defaultParams(meta: MetaResponse): AnalysisParams {
  return {
    from: meta.first_day,
    to: meta.last_day,
    mode: "cutoff",
    cutoffTime: meta.default_cutoff_time,
    horizonH: 24,
  };
}
