import type { MetricsResponse } from "../api/types";
import { buildTiles } from "../lib/kpis";
import { InfoTip } from "./InfoTip";
import { Skeleton } from "./states";

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
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {buildTiles(data).map((t) => (
        <div
          key={t.label}
          className={`relative rounded-xl border p-4 ${
            t.emphasis
              ? "col-span-2 border-accent/40 bg-surface md:col-span-1"
              : "border-line bg-surface"
          }`}
        >
          <dt className="text-sm text-ink-2">
            {t.label} <InfoTip label={t.label} text={t.definition} />
          </dt>
          <dd className={`mt-1 font-semibold text-ink ${t.emphasis ? "text-3xl" : "text-2xl"}`}>
            {t.value}
          </dd>
          <dd className="mt-1 text-xs text-muted">{t.note}</dd>
        </div>
      ))}
    </dl>
  );
}
