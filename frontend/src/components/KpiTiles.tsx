import { useMemo, type ReactNode } from "react";

import type { GroupRow, MetricsResponse } from "../api/types";
import { buildTiles } from "../lib/kpis";
import { Sparkline, type SparkPoint } from "./Sparkline";
import { Badge, Skeleton, Stat, cx } from "./ui";

// 2 columns on phones, 4 on tablets (the buffer tile takes a full row), 5 from 1280 px.
const GRID = "grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5";
const PRIMARY_SPAN = "col-span-2 md:col-span-4 xl:col-span-1";

function TileSkeleton({ primary = false }: { primary?: boolean }) {
  return (
    <div
      className={cx(
        "flex flex-col gap-3 rounded-card border border-line bg-panel p-4",
        primary && PRIMARY_SPAN,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-2.5 w-32" />
      <Skeleton className="mt-1 h-7 w-full" />
    </div>
  );
}

export function KpiTiles({
  data,
  isLoading,
  daily,
  renderValue,
}: {
  data: MetricsResponse | undefined;
  isLoading: boolean;
  /** Per-day metrics (GET /metrics/by-day) for the sparklines. */
  daily?: GroupRow[];
  /** Renders a tile's number; the motion layer passes an animated counter. */
  renderValue?: (raw: number | null, format: (v: number | null) => string) => ReactNode;
}) {
  const tiles = useMemo(() => (data ? buildTiles(data) : []), [data]);
  const sparks = useMemo(
    () =>
      tiles.map(
        (t): SparkPoint[] =>
          daily?.map((d) => ({ key: d.key, value: t.spark.pick(d.metrics) })) ?? [],
      ),
    [tiles, daily],
  );

  if (!data) {
    return (
      <div className={GRID} aria-busy={isLoading}>
        {Array.from({ length: 5 }, (_, i) => (
          <TileSkeleton key={i} primary={i === 0} />
        ))}
      </div>
    );
  }
  return (
    <dl className={GRID}>
      {tiles.map((t, i) => (
        <Stat
          key={t.label}
          label={t.label}
          definition={t.definition}
          value={renderValue ? renderValue(t.raw, t.format) : t.value}
          note={t.note}
          primary={t.emphasis}
          badge={t.emphasis ? <Badge tone="accent">Primary</Badge> : undefined}
          className={t.emphasis ? PRIMARY_SPAN : undefined}
          extra={
            daily ? (
              <Sparkline
                points={sparks[i] ?? []}
                label={t.spark.label}
                signed={t.spark.signed}
                color={t.emphasis ? "var(--accent)" : undefined}
              />
            ) : (
              <Skeleton className="h-7 w-full" />
            )
          }
        />
      ))}
    </dl>
  );
}
