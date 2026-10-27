// Legends live outside the Recharts modules so they render before the lazy chart chunk loads.
import { chart } from "../../lib/theme";
import { Legend } from "../ChartCard";

export function MainLegend({ showCorrected = false }: { showCorrected?: boolean }) {
  return (
    <Legend
      items={[
        { label: "Actual (FUELHH, hourly mean)", color: chart.actual },
        { label: "Forecast available at decision time (WINDFOR)", color: chart.forecast },
        ...(showCorrected
          ? [{ label: "Bias-corrected forecast", color: chart.corrected, kind: "dash" as const }]
          : []),
        { label: "Forecast − actual gap", color: chart.gapFill, kind: "band" as const },
      ]}
    />
  );
}

export function SignLegend() {
  return (
    <Legend
      items={[
        { label: "Forecast above actual (shortfall)", color: chart.shortfall, kind: "box" },
        { label: "Forecast below actual (surplus)", color: chart.surplus, kind: "box" },
      ]}
    />
  );
}

export function HorizonLegend() {
  return (
    <Legend
      items={[
        { label: "Mean absolute error", color: chart.actual },
        { label: "P90 shortfall", color: chart.forecast },
      ]}
    />
  );
}
