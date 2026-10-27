import { useEffect, useState } from "react";

import { API_BASE, csvUrl, type AnalysisParams } from "./api/client";
import {
  useBias,
  useByDay,
  useByHorizon,
  useByHour,
  useCorrection,
  useDistribution,
  useMeta,
  useMetrics,
  useSeries,
} from "./api/hooks";
import type { BufferBasis, MetaResponse } from "./api/types";
import { AppHeader } from "./components/AppHeader";
import { ChartCard } from "./components/ChartCard";
import { ControlBar } from "./components/ControlBar";
import {
  DayChart,
  Histogram,
  HorizonChart,
  HourChart,
  MainChart,
  preloadCharts,
} from "./components/charts/lazy";
import { HorizonLegend, MainLegend, SignLegend } from "./components/charts/legends";
import { GroupTable, HistogramTable, HorizonTable, MainTable } from "./components/charts/tables";
import { BiasNote, CorrectionPanel } from "./components/Diagnostics";
import { Explainer } from "./components/Explainer";
import { HeroSkeleton, InsightCard } from "./components/InsightCard";
import { KpiTiles } from "./components/KpiTiles";
import { ErrorState } from "./components/states";
import { Card, Skeleton } from "./components/ui";
import { formatDeliveryDay, formatHourOfDay } from "./lib/format";
import { defaultParams } from "./lib/params";

const HISTOGRAM_BIN_MW = 500;

/** Debounce so dragging the slider fires one request per pause, not one per step. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(id);
    };
  }, [value, ms]);
  return v;
}

const PAGE = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8";

function Dashboard({ meta }: { meta: MetaResponse }) {
  const [rawParams, setParams] = useState<AnalysisParams>(() => defaultParams(meta));
  const [percentile, setPercentile] = useState(meta.default_percentile);
  const [basis, setBasis] = useState<BufferBasis>("total");
  const [showCorrected, setShowCorrected] = useState(false);
  const params = useDebounced(rawParams, 200);
  const cutoffMode = params.mode === "cutoff";

  const metrics = useMetrics(params, percentile, basis);
  const correction = useCorrection(params);
  const series = useSeries(params);
  const horizon = useByHorizon(params);
  const hour = useByHour(params);
  const day = useByDay(params);
  const dist = useDistribution(params, HISTOGRAM_BIN_MW);
  const bias = useBias(params);

  useEffect(preloadCharts, []);

  const modeLabel =
    params.mode === "cutoff"
      ? `forecast available at ${params.cutoffTime} on D-1`
      : `forecast made ≥ ${params.horizonH} h ahead`;
  const corrected = showCorrected && cutoffMode;

  return (
    <>
      <ControlBar
        meta={meta}
        params={rawParams}
        percentile={percentile}
        basis={basis}
        csvHref={csvUrl(params)}
        onChange={setParams}
        onPercentile={setPercentile}
        onBasis={setBasis}
        onReset={() => {
          setParams(defaultParams(meta));
          setPercentile(meta.default_percentile);
          setBasis("total");
          setShowCorrected(false);
        }}
      />

      <main id="main" className={`${PAGE} space-y-6 pt-6 pb-10 sm:space-y-8`}>
        <p className="max-w-3xl text-body text-ink-2">
          How far the day-ahead national wind forecast missed actual output, and what that means for
          purchasing
        </p>

        {metrics.error ? (
          <Card>
            <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} />
          </Card>
        ) : (
          <div className="space-y-4">
            <InsightCard data={metrics.data} distribution={dist.data} />
            <KpiTiles data={metrics.data} isLoading={metrics.isLoading} daily={day.data?.rows} />
          </div>
        )}

        <div className="space-y-4">
          <ChartCard
            title="Actual vs forecast"
            subtitle={`Hourly national wind generation; ${modeLabel}`}
            ariaLabel="Line chart of hourly actual and forecast wind generation, with the gap between them shaded. Use Show table for the numbers."
            isLoading={series.isLoading}
            isRefreshing={series.isPlaceholderData}
            error={series.error}
            isEmpty={series.data?.points.length === 0}
            onRetry={() => void series.refetch()}
            legend={<MainLegend showCorrected={corrected} />}
            unit="GW"
            height={360}
            table={() => <MainTable points={series.data?.points ?? []} />}
          >
            {() => <MainChart points={series.data?.points ?? []} showCorrected={corrected} />}
          </ChartCard>

          <CorrectionPanel
            data={correction.data}
            show={showCorrected}
            onToggle={setShowCorrected}
            available={cutoffMode}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Error by forecast lead time"
            subtitle="How accuracy improves as the forecast gets closer to delivery"
            ariaLabel="Line chart of mean absolute error and P90 shortfall by forecast lead time"
            unit="GW"
            isLoading={horizon.isLoading}
            isRefreshing={horizon.isPlaceholderData}
            error={horizon.error}
            isEmpty={horizon.data?.rows.length === 0}
            onRetry={() => void horizon.refetch()}
            legend={<HorizonLegend />}
            table={() => (horizon.data ? <HorizonTable data={horizon.data} /> : null)}
          >
            {() =>
              horizon.data && (
                <HorizonChart
                  data={horizon.data}
                  selectedH={params.mode === "horizon" ? params.horizonH : null}
                />
              )
            }
          </ChartCard>

          <ChartCard
            title="Error distribution"
            subtitle={`Hours by size of miss (forecast − actual), ${HISTOGRAM_BIN_MW} MW bins`}
            ariaLabel="Histogram of hourly forecast error with the suggested buffer marked"
            shape="bars"
            isLoading={dist.isLoading}
            isRefreshing={dist.isPlaceholderData}
            error={dist.error}
            isEmpty={dist.data?.n === 0}
            onRetry={() => void dist.refetch()}
            legend={<SignLegend />}
            unit="Hours"
            table={() => (dist.data ? <HistogramTable data={dist.data} /> : null)}
          >
            {() =>
              dist.data && (
                <Histogram
                  data={dist.data}
                  bufferMw={metrics.data?.insight.buffer_mw ?? null}
                  basis={metrics.data?.insight.basis ?? basis}
                />
              )
            }
          </ChartCard>

          <ChartCard
            title="Error by hour of day"
            subtitle="Mean absolute error by delivery hour, UK time"
            ariaLabel="Bar chart of mean absolute error by hour of day"
            shape="bars"
            unit="GW"
            isLoading={hour.isLoading}
            isRefreshing={hour.isPlaceholderData}
            error={hour.error}
            isEmpty={hour.data?.rows.length === 0}
            onRetry={() => void hour.refetch()}
            table={() => (
              <GroupTable
                rows={hour.data?.rows ?? []}
                keyLabel="Hour"
                formatKey={formatHourOfDay}
              />
            )}
          >
            {() => <HourChart rows={hour.data?.rows ?? []} />}
          </ChartCard>

          <ChartCard
            title="Bias by delivery day"
            subtitle="Average forecast − actual for each day"
            ariaLabel="Bar chart of average forecast minus actual for each delivery day"
            shape="bars"
            unit="GW"
            isLoading={day.isLoading}
            isRefreshing={day.isPlaceholderData}
            error={day.error}
            isEmpty={day.data?.rows.length === 0}
            onRetry={() => void day.refetch()}
            legend={<SignLegend />}
            table={() => (
              <GroupTable
                rows={day.data?.rows ?? []}
                keyLabel="Day"
                formatKey={formatDeliveryDay}
              />
            )}
          >
            {() => <DayChart rows={day.data?.rows ?? []} />}
          </ChartCard>
        </div>

        <div className="space-y-4">
          <BiasNote data={bias.data} />
          <Explainer />
        </div>
      </main>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className={`${PAGE} space-y-6 pt-6 sm:space-y-8`}>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard…</span>
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
      <HeroSkeleton />
      <Skeleton className="h-96 w-full rounded-card" />
    </div>
  );
}

export function App() {
  const meta = useMeta();
  return (
    <div className="relative flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-panel px-3 py-2 text-body text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader meta={meta.data} />
      {meta.error ? (
        <main id="main" className={`${PAGE} pt-6`}>
          <Card>
            <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
          </Card>
        </main>
      ) : meta.data ? (
        <Dashboard meta={meta.data} />
      ) : (
        <DashboardSkeleton />
      )}
      <footer className={`${PAGE} mt-auto border-t border-line py-6 text-label text-muted`}>
        <p>
          Data: Elexon BMRS (WINDFOR forecasts, FUELHH outturn), national level. Times shown in
          Europe/London. Built from a cached snapshot so the dashboard works when Elexon is down.
        </p>
        <p className="mt-2">
          <a
            href={`${API_BASE}/docs`}
            className="underline decoration-line-strong underline-offset-2 hover:text-ink"
          >
            API docs
          </a>
        </p>
      </footer>
    </div>
  );
}
