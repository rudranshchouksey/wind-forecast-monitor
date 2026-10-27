import type { AnalysisParams } from "../api/client";
import type { MetaResponse } from "../api/types";

export const PERCENTILES = [80, 90, 95, 99] as const;
export const HORIZON_MIN = 1;
/** Every hour has a forecast up to ~46 h ahead; beyond that WINDFOR coverage thins out. */
export const HORIZON_MAX = 60;

export function defaultParams(meta: MetaResponse): AnalysisParams {
  return {
    from: meta.first_day,
    to: meta.last_day,
    mode: "cutoff",
    cutoffTime: meta.default_cutoff_time,
    horizonH: 24,
  };
}
