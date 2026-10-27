import type { AnalysisParams } from "../api/client";
import type { BufferBasis, MetaResponse } from "../api/types";

const monthFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Elexon snapshot · Jan 2026", from the first delivery day in the snapshot. */
export function snapshotLabel(meta: MetaResponse): string {
  return `Elexon snapshot · ${monthFmt.format(new Date(`${meta.first_day}T12:00:00Z`))}`;
}

/** "09:20 D-1 · P90 · incl. offset": the current settings in one line, for the summary chip. */
export function settingsSummary({
  params,
  percentile,
  basis,
}: {
  params: AnalysisParams;
  percentile: number;
  basis: BufferBasis;
}): string {
  const when = params.mode === "cutoff" ? `${params.cutoffTime} D-1` : `${params.horizonH} h ahead`;
  return `${when} · P${percentile} · ${basis === "total" ? "incl. offset" : "random only"}`;
}
