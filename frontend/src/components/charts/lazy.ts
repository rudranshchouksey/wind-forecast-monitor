import { lazy } from "react";

// Recharts and the chart components load as separate chunks after the first paint
// (docs/design.md §9). Legends, tables and skeletons stay in the initial bundle.
const breakdown = () => import("./BreakdownCharts");

export const MainChart = lazy(() => import("./MainChart").then((m) => ({ default: m.MainChart })));
export const HorizonChart = lazy(() => breakdown().then((m) => ({ default: m.HorizonChart })));
export const HourChart = lazy(() => breakdown().then((m) => ({ default: m.HourChart })));
export const DayChart = lazy(() => breakdown().then((m) => ({ default: m.DayChart })));
export const Histogram = lazy(() => breakdown().then((m) => ({ default: m.Histogram })));

/** Start fetching the chart chunks early (called once the metadata has loaded). */
export function preloadCharts() {
  void import("./MainChart");
  void breakdown();
}
