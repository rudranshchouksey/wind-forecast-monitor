import type { ReactNode } from "react";

import type { DistributionResponse, MetricsResponse } from "../api/types";
import { formatHours, formatMw, formatPct } from "../lib/format";
import { bufferLineLabel, buildTiles } from "../lib/kpis";
import { MiniDistribution } from "./MiniDistribution";
import { Skeleton, cx } from "./ui";

/** Splits "4,098 MW" into the number and its unit, so the unit can be set smaller. */
function splitUnit(s: string): [string, string] {
  const i = s.lastIndexOf(" ");
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ""];
}

export function HeroSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-6 rounded-card border border-line bg-panel/80 p-5 sm:p-7 lg:grid-cols-[1.5fr_1fr]"
    >
      <div className="space-y-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-4 w-3/4 max-w-lg" />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/**
 * The decision hero: the suggested buffer as the centrepiece, the plain-English takeaway, the
 * caveat as a callout and the buffer line on a mini distribution.
 */
export function InsightCard({
  data,
  distribution,
  renderNumber,
  className,
}: {
  data: MetricsResponse | undefined;
  distribution?: DistributionResponse;
  /** Renders the big number; the motion layer passes an animated counter. */
  renderNumber?: (raw: number | null, format: (v: number | null) => string) => ReactNode;
  className?: string;
}) {
  if (!data) return <HeroSkeleton />;
  const { insight, query, mean_horizon_h, coverage } = data;
  const buffer = buildTiles(data)[0];
  const [, unit] = splitUnit(formatMw(insight.buffer_mw));
  const numberOnly = (v: number | null) => splitUnit(formatMw(v))[0];
  const basis =
    query.mode === "cutoff"
      ? `Forecasts available at ${query.cutoff_time} London the day before delivery (on average ${formatHours(mean_horizon_h)} ahead).`
      : `Forecasts made at least ${formatHours(query.horizon_h)} before each hour.`;
  return (
    <section
      aria-labelledby="insight-heading"
      className={cx(
        "relative overflow-hidden rounded-card border border-line bg-panel/80 shadow-card backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="grid gap-x-10 gap-y-6 p-5 sm:p-7 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <p className="text-label font-semibold tracking-[0.08em] text-accent uppercase">
            Day-ahead wind haircut
          </p>
          <h2 id="insight-heading" className="mt-1 text-body font-medium text-ink-2">
            Procurement takeaway
          </h2>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-[2.5rem] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-display">
              {renderNumber
                ? renderNumber(insight.buffer_mw, numberOnly)
                : numberOnly(insight.buffer_mw)}
            </span>
            <span className="font-mono text-title font-medium text-ink-2">{unit}</span>
          </div>
          {buffer && (
            <p className="mt-2 text-label text-muted">
              {buffer.label} · {buffer.note}
            </p>
          )}
          <p className="mt-5 max-w-2xl text-title font-semibold text-balance text-ink">
            {insight.headline}
          </p>
          <p className="mt-2 max-w-2xl text-body text-ink-2">{insight.detail}</p>
          <p className="mt-3 max-w-2xl text-label text-muted">
            {basis} {coverage.evaluated.toLocaleString("en-GB")} of{" "}
            {coverage.expected_hours.toLocaleString("en-GB")} hours evaluated (
            {formatPct(coverage.ratio)}).
          </p>
        </div>

        <div className="flex min-w-0 flex-col justify-end gap-3 lg:border-l lg:border-line lg:pl-10">
          <p className="text-label font-medium tracking-[0.04em] text-ink-2 uppercase">
            Error distribution
          </p>
          {distribution ? (
            <MiniDistribution
              data={distribution}
              bufferMw={insight.buffer_mw}
              basis={insight.basis}
            />
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
          {insight.buffer_mw !== null && (
            <p className="flex items-center gap-2 text-label text-ink-2">
              <span
                aria-hidden="true"
                className="h-3 w-0 border-l-[1.5px] border-dashed border-ink"
              />
              {bufferLineLabel(insight.buffer_mw, insight.basis)}
            </p>
          )}
        </div>
      </div>

      {insight.caveat && (
        <div
          role="note"
          className="flex gap-2.5 border-t border-line bg-warn-bg/70 px-5 py-3 text-body text-warn-ink sm:px-7"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="mt-[3px] h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 5v3.5M8 11h.01M8 1.5l6.5 12h-13L8 1.5Z" />
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
