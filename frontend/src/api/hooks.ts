import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, type AnalysisParams } from "./client";
import type { BufferBasis } from "./types";

// Keep the previous render on screen while the next params load, so charts don't flash empty.
const analysis = { placeholderData: keepPreviousData, staleTime: 5 * 60_000 } as const;

export const useMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: ({ signal }) => api.meta(signal), staleTime: Infinity });

export const useMetrics = (p: AnalysisParams, percentile: number, basis: BufferBasis) =>
  useQuery({
    queryKey: ["metrics", p, percentile, basis],
    queryFn: ({ signal }) => api.metrics(p, percentile, basis, signal),
    ...analysis,
  });

/** Only defined at the decision cutoff, so it is not requested in horizon mode. */
export const useCorrection = (p: AnalysisParams) =>
  useQuery({
    queryKey: ["correction", p.from, p.to, p.cutoffTime],
    queryFn: ({ signal }) => api.correction(p, signal),
    enabled: p.mode === "cutoff",
    ...analysis,
  });

export const useSeries = (p: AnalysisParams) =>
  useQuery({
    queryKey: ["series", p],
    queryFn: ({ signal }) => api.series(p, signal),
    ...analysis,
  });

// The horizon curve is independent of mode/horizon; key it on what it depends on.
export const useByHorizon = (p: AnalysisParams) => {
  const base: AnalysisParams = { ...p, mode: "cutoff", horizonH: 24 };
  return useQuery({
    queryKey: ["by-horizon", p.from, p.to, p.cutoffTime],
    queryFn: ({ signal }) => api.byHorizon(base, signal),
    ...analysis,
  });
};

export const useByHour = (p: AnalysisParams) =>
  useQuery({
    queryKey: ["by-hour", p],
    queryFn: ({ signal }) => api.byHour(p, signal),
    ...analysis,
  });

export const useByDay = (p: AnalysisParams) =>
  useQuery({ queryKey: ["by-day", p], queryFn: ({ signal }) => api.byDay(p, signal), ...analysis });

export const useDistribution = (p: AnalysisParams, binMw: number) =>
  useQuery({
    queryKey: ["distribution", p, binMw],
    queryFn: ({ signal }) => api.distribution(p, binMw, signal),
    ...analysis,
  });

export const useBias = (p: AnalysisParams) =>
  useQuery({ queryKey: ["bias", p], queryFn: ({ signal }) => api.bias(p, signal), ...analysis });
