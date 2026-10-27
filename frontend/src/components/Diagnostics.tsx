import { memo } from "react";
import type { BiasDiagnosticsResponse, CorrectionResponse } from "../api/types";
import { formatGwSigned, levelGrowthSentence } from "../lib/diagnostics";
import { formatDeliveryDay, formatMw } from "../lib/format";
import { Card, Collapsible, Skeleton, Switch } from "./ui";

const BIAS_TITLE = "Is the bias forecast error? (diagnostics)";

function BiasNoteView({ data }: { data: BiasDiagnosticsResponse | undefined }) {
  // The collapsed header is there from the start, so nothing below it moves when data arrives.
  if (!data)
    return (
      <Collapsible title={BIAS_TITLE}>
        <Skeleton className="h-24 w-full" />
      </Collapsible>
    );
  const growth = levelGrowthSentence(data.by_forecast_level);
  const hindFirst = data.hindcast_by_level[0];
  const hindLast = data.hindcast_by_level[data.hindcast_by_level.length - 1];
  const summary: [string, string][] = [
    [
      "All hours at the selected cutoff/lead time",
      formatMw(data.overall_bias_mw, { signed: true }),
    ],
    ["Forecast made 0 h before the hour", formatMw(data.bias_at_zero_horizon_mw, { signed: true })],
    [
      `WINDFOR values for ${data.hindcast.label}`,
      formatMw(data.hindcast.bias_mw, { signed: true }),
    ],
  ];
  return (
    <Collapsible title={BIAS_TITLE}>
      <div className="space-y-4 text-body text-ink-2">
        <p>
          If the gap were forecasting skill, it would shrink as the forecast gets closer to real
          time. It barely does, and WINDFOR stays above FUELHH even for hours that had already ended
          when it was published. That points to a persistent difference between the two series, not
          weather uncertainty.
        </p>
        {growth && (
          <p>
            <strong className="font-semibold text-ink">{growth}</strong>{" "}
            {hindFirst && hindLast && (
              <>
                The same rise appears in WINDFOR&apos;s values for hours that had already ended (
                {formatGwSigned(hindFirst.bias_mw)} to {formatGwSigned(hindLast.bias_mw)}), which
                carry little weather error, so it is not just a statistical artefact of grouping by
                forecast.
              </>
            )}
          </p>
        )}

        <table className="w-full text-body">
          <caption className="sr-only">
            Mean forecast minus actual under different conditions
          </caption>
          <tbody>
            {summary.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
                  {k}
                </th>
                <td className="py-1.5 text-right font-mono font-medium text-ink">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-body">
            <caption className="mb-1.5 text-left text-label font-medium tracking-[0.04em] text-ink-2 uppercase">
              Mean forecast − actual by level
            </caption>
            <thead className="text-label text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Level
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  By forecast
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Already-ended hours
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  By actual
                </th>
              </tr>
            </thead>
            <tbody>
              {data.by_forecast_level.map((b, i) => (
                <tr key={b.label} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">
                    {b.label}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-mono text-ink">
                    {formatGwSigned(b.bias_mw)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-ink">
                    {formatGwSigned(data.hindcast_by_level[i]?.bias_mw)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-ink">
                    {formatGwSigned(data.by_actual_level[i]?.bias_mw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="font-medium text-ink">Possible explanations (unconfirmed hypotheses)</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Curtailment at high wind.</strong> FUELHH is metered
              output after constraint actions. If WINDFOR forecasts what the farms could generate,
              the gap would widen at high wind, when curtailment is most common.
            </li>
            <li>
              <strong className="text-ink">Capacity counted in WINDFOR but not in FUELHH.</strong>{" "}
              If the forecast covers farms that are not in FUELHH&apos;s WIND set, the gap would
              scale with total output.
            </li>
          </ul>
          <p className="mt-2">
            Elexon&apos;s documentation says both datasets cover operationally metered wind farms,
            and it does not settle which (if either) applies. Testing it would need other BMRS
            datasets, which this tool deliberately does not use.
          </p>
        </div>
        <p className="text-label text-muted">
          Delivery days {formatDeliveryDay(data.query.from)} to {formatDeliveryDay(data.query.to)}.
          Full write-up in docs/analysis.md.
        </p>
      </div>
    </Collapsible>
  );
}

function change(pct: number | null): string {
  if (pct === null) return "";
  return ` (${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%)`;
}

export function CorrectionPanel({
  data,
  show,
  onToggle,
  available,
}: {
  data: CorrectionResponse | undefined;
  show: boolean;
  onToggle: (v: boolean) => void;
  available: boolean;
}) {
  if (!available) {
    return (
      <Card padded={false} className="px-4 py-3.5 sm:px-5">
        <p className="text-body text-ink-2">
          The bias-corrected forecast is only defined at the decision cutoff. Switch to “At decision
          cutoff” to see it.
        </p>
      </Card>
    );
  }
  if (!data)
    return (
      <Card
        title="Bias-corrected forecast"
        aria-busy="true"
        className="min-h-[24.5rem] sm:min-h-[18rem] lg:min-h-[233px]"
      >
        <div aria-hidden="true" className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-28 w-full" />
        </div>
      </Card>
    );
  const rows: [string, string][] = [
    [
      "Mean absolute error",
      `${formatMw(data.raw.mae_mw)} → ${formatMw(data.corrected.mae_mw)}${change(data.mae_change_pct)}`,
    ],
    [
      "RMSE",
      `${formatMw(data.raw.rmse_mw)} → ${formatMw(data.corrected.rmse_mw)}${change(data.rmse_change_pct)}`,
    ],
    [
      "Bias",
      `${formatMw(data.raw.bias_mw, { signed: true })} → ${formatMw(data.corrected.bias_mw, { signed: true })}`,
    ],
  ];
  return (
    <Card
      title="Bias-corrected forecast"
      subtitle={
        <>
          Refitted every day as actual ≈ a × forecast + b on the {data.window_days} complete days
          before the decision, using past data only. Corrected {data.days_corrected} of{" "}
          {data.days_total} days ({data.raw.n} hours).
        </>
      }
      actions={<Switch label="Show on main chart" checked={show} onChange={onToggle} />}
    >
      {data.days_corrected === 0 ? (
        <p className="text-body text-ink-2">Not enough past days to fit a correction.</p>
      ) : (
        <table className="w-full text-body">
          <caption className="sr-only">Raw versus bias-corrected forecast accuracy</caption>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-2">
                  {k}
                </th>
                <td className="py-1.5 text-right font-mono font-medium text-ink">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-label text-muted">
        Illustrative: a simple statistical correction of the offset, not a new forecast. The fit for
        day D never sees an actual from D-1 onwards, and its forecasts use the same leakage-free
        cutoff as everything else.
      </p>
    </Card>
  );
}

/** Memoised: re-renders only when the diagnostics response changes. */
export const BiasNote = memo(BiasNoteView);
