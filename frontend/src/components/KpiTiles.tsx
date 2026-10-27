import type { MetricsResponse } from "../api/types";
import { buildTiles } from "../lib/kpis";
import { Badge, Skeleton, Stat } from "./ui";

function TileSkeleton({ primary = false }: { primary?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-card border border-line bg-panel p-4 ${
        primary ? "col-span-2 md:col-span-1" : ""
      }`}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-2.5 w-32" />
      <Skeleton className="mt-1 h-6 w-full" />
    </div>
  );
}

export function KpiTiles({
  data,
  isLoading,
}: {
  data: MetricsResponse | undefined;
  isLoading: boolean;
}) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-busy={isLoading}>
        {Array.from({ length: 5 }, (_, i) => (
          <TileSkeleton key={i} primary={i === 0} />
        ))}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {buildTiles(data).map((t) => (
        <Stat
          key={t.label}
          label={t.label}
          definition={t.definition}
          value={t.value}
          note={t.note}
          primary={t.emphasis}
          badge={t.emphasis ? <Badge tone="accent">Primary</Badge> : undefined}
          className={t.emphasis ? "col-span-2 md:col-span-1" : undefined}
        />
      ))}
    </dl>
  );
}
