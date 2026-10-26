import { useEffect, useState } from "react";

import { API_BASE, csvUrl, type AnalysisParams } from "./api/client";
import {
  useBias,
  useByDay,
  useByHorizon,
  useByHour,
  useDistribution,
  useMeta,
  useMetrics,
  useSeries,
} from "./api/hooks";
import type { MetaResponse } from "./api/types";
import {
  DayChart,
  GroupTable,
  HistogramTable,
  Histogram,
  HorizonChart,
  HorizonTable,
  HourChart,
  HorizonLegend,
  SignLegend,
} from "./components/BreakdownCharts";
import { ChartCard } from "./components/ChartCard";
import { Controls } from "./components/Controls";
import { Explainer } from "./components/Explainer";
import { BiasNote, InsightCard } from "./components/InsightCard";
import { KpiTiles } from "./components/KpiTiles";
import { MainChart, MainLegend, MainTable } from "./components/MainChart";
import { ErrorState, LoadingBlock } from "./components/states";
import { formatDeliveryDay, formatHourOfDay } from "./lib/format";
import { defaultParams } from "./lib/params";
import { useTheme } from "./lib/theme";

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

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">GB Wind Forecast Monitor</h1>
        <p className="text-sm text-ink-2">
          How far the day-ahead national wind forecast missed actual output, and what that means for
          purchasing
        </p>
      </div>
      <nav className="flex items-center gap-2" aria-label="Utilities">
        <a
          href={`${API_BASE}/docs`}
          className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
        >
          API docs
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}

function Dashboard({ meta }: { meta: MetaResponse }) {
  const [rawParams, setParams] = useState<AnalysisParams>(() => defaultParams(meta));
  const [percentile, setPercentile] = useState(meta.default_percentile);
  const params = useDebounced(rawParams, 200);

  const metrics = useMetrics(params, percentile);
  const series = useSeries(params);
  const horizon = useByHorizon(params);
  const hour = useByHour(params);
  const day = useByDay(params);
  const dist = useDistribution(params, HISTOGRAM_BIN_MW);
  const bias = useBias(params);

  const modeLabel =
    params.mode === "cutoff"
      ? `forecast available at ${params.cutoffTime} on D-1`
      : `forecast made ≥ ${params.horizonH} h ahead`;

  return (
    <div className="space-y-5">
      <Controls
        meta={meta}
        params={rawParams}
        percentile={percentile}
        csvHref={csvUrl(params)}
        onChange={setParams}
        onPercentile={setPercentile}
        onReset={() => {
          setParams(defaultParams(meta));
          setPercentile(meta.default_percentile);
        }}
      />

      {metrics.error ? (
        <div className="rounded-xl border border-line bg-surface">
          <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} />
        </div>
      ) : (
        <>
          <KpiTiles data={metrics.data} isLoading={metrics.isLoading} />
          <InsightCard data={metrics.data} />
        </>
      )}

      <ChartCard
        title="Actual vs forecast"
        subtitle={`Hourly national wind generation; ${modeLabel}`}
        isLoading={series.isLoading}
        error={series.error}
        isEmpty={series.data?.points.length === 0}
        onRetry={() => void series.refetch()}
        legend={<MainLegend />}
        height={340}
        table={() => <MainTable points={series.data?.points ?? []} />}
      >
        {() => <MainChart points={series.data?.points ?? []} />}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Error by forecast lead time"
          subtitle="How accuracy improves as the forecast gets closer to delivery (GW)"
          isLoading={horizon.isLoading}
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
          isLoading={dist.isLoading}
          error={dist.error}
          isEmpty={dist.data?.n === 0}
          onRetry={() => void dist.refetch()}
          legend={<SignLegend />}
          table={() => (dist.data ? <HistogramTable data={dist.data} /> : null)}
        >
          {() =>
            dist.data && (
              <Histogram data={dist.data} bufferMw={metrics.data?.insight.buffer_mw ?? null} />
            )
          }
        </ChartCard>

        <ChartCard
          title="Error by hour of day"
          subtitle="Mean absolute error by delivery hour, UK time (GW)"
          isLoading={hour.isLoading}
          error={hour.error}
          isEmpty={hour.data?.rows.length === 0}
          onRetry={() => void hour.refetch()}
          table={() => (
            <GroupTable rows={hour.data?.rows ?? []} keyLabel="Hour" formatKey={formatHourOfDay} />
          )}
        >
          {() => <HourChart rows={hour.data?.rows ?? []} />}
        </ChartCard>

        <ChartCard
          title="Bias by delivery day"
          subtitle="Average forecast − actual for each day (GW)"
          isLoading={day.isLoading}
          error={day.error}
          isEmpty={day.data?.rows.length === 0}
          onRetry={() => void day.refetch()}
          legend={<SignLegend />}
          table={() => (
            <GroupTable rows={day.data?.rows ?? []} keyLabel="Day" formatKey={formatDeliveryDay} />
          )}
        >
          {() => <DayChart rows={day.data?.rows ?? []} />}
        </ChartCard>
      </div>

      <BiasNote data={bias.data} />
      <Explainer />
    </div>
  );
}

export function App() {
  const meta = useMeta();
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Header />
      <main>
        {meta.error ? (
          <div className="rounded-xl border border-line bg-surface">
            <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
          </div>
        ) : meta.data ? (
          <Dashboard meta={meta.data} />
        ) : (
          <LoadingBlock label="Loading dashboard" />
        )}
      </main>
      <footer className="pb-4 text-xs text-muted">
        Data: Elexon BMRS (WINDFOR forecasts, FUELHH outturn), national level. Times shown in
        Europe/London. Built from a cached snapshot so the dashboard works when Elexon is down.
      </footer>
    </div>
  );
}
