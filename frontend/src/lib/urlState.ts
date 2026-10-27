import { useCallback, useEffect, useState } from "react";

import type { AnalysisParams } from "../api/client";
import type { BufferBasis, MetaResponse } from "../api/types";
import { HORIZON_MAX, HORIZON_MIN, PERCENTILES, defaultParams } from "./params";

/** Everything the controls set: the whole view, so any view is a shareable link. */
export interface ViewState {
  params: AnalysisParams;
  percentile: number;
  basis: BufferBasis;
  corrected: boolean;
}

export function defaultView(meta: MetaResponse): ViewState {
  return {
    params: defaultParams(meta),
    percentile: meta.default_percentile,
    basis: "total",
    corrected: false,
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a view from a query string. Each value is validated on its own and falls back to its
 * default when missing or invalid, so a hand-edited or stale link still opens a sensible view.
 */
export function parseView(search: string, meta: MetaResponse): ViewState {
  const q = new URLSearchParams(search);
  const d = defaultView(meta);
  const inRange = (v: string | null): v is string =>
    v !== null && DATE.test(v) && v >= meta.first_day && v <= meta.last_day;

  let from = inRange(q.get("from")) ? (q.get("from") as string) : d.params.from;
  let to = inRange(q.get("to")) ? (q.get("to") as string) : d.params.to;
  if (from > to) [from, to] = [d.params.from, d.params.to];

  const mode = q.get("mode") === "horizon" ? "horizon" : "cutoff";
  const cutoff = q.get("cutoff");
  const cutoffTime = meta.cutoff_presets.some((p) => p.time === cutoff)
    ? (cutoff as string)
    : d.params.cutoffTime;
  const h = Number(q.get("h"));
  const horizonH =
    Number.isInteger(h) && h >= HORIZON_MIN && h <= HORIZON_MAX ? h : d.params.horizonH;
  const p = Number(q.get("p"));
  const percentile = (PERCENTILES as readonly number[]).includes(p) ? p : d.percentile;
  const basis: BufferBasis = q.get("basis") === "random" ? "random" : "total";
  const corrected = q.get("corrected") === "1";

  return { params: { from, to, mode, cutoffTime, horizonH }, percentile, basis, corrected };
}

/** The query string for a view, with only the values that differ from the defaults. */
export function serializeView(v: ViewState, meta: MetaResponse): string {
  const d = defaultView(meta);
  const q = new URLSearchParams();
  if (v.params.from !== d.params.from) q.set("from", v.params.from);
  if (v.params.to !== d.params.to) q.set("to", v.params.to);
  if (v.params.mode !== d.params.mode) q.set("mode", v.params.mode);
  if (v.params.cutoffTime !== d.params.cutoffTime) q.set("cutoff", v.params.cutoffTime);
  if (v.params.horizonH !== d.params.horizonH) q.set("h", String(v.params.horizonH));
  if (v.percentile !== d.percentile) q.set("p", String(v.percentile));
  if (v.basis !== d.basis) q.set("basis", v.basis);
  if (v.corrected) q.set("corrected", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface SetViewOptions {
  /** Replace the current history entry instead of adding one (slider drags, date typing). */
  replace?: boolean;
}

/**
 * The view, kept in sync with the URL. Discrete changes push a history entry, so Back steps
 * through them; continuous ones replace it. Back and Forward restore the controls.
 */
export function useUrlState(
  meta: MetaResponse,
): [ViewState, (next: ViewState, opts?: SetViewOptions) => void] {
  const [view, setView] = useState(() => parseView(window.location.search, meta));

  // Normalise the address bar once: drop invalid or default-valued keys from a shared link.
  useEffect(() => {
    const canonical = serializeView(parseView(window.location.search, meta), meta);
    if (canonical !== window.location.search) {
      window.history.replaceState(window.history.state, "", urlFor(canonical));
    }
  }, [meta]);

  useEffect(() => {
    const onPop = () => {
      setView(parseView(window.location.search, meta));
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [meta]);

  const update = useCallback(
    (next: ViewState, opts: SetViewOptions = {}) => {
      setView(next);
      const search = serializeView(next, meta);
      if (search === window.location.search) return;
      const url = urlFor(search);
      if (opts.replace) window.history.replaceState(window.history.state, "", url);
      else window.history.pushState(null, "", url);
    },
    [meta],
  );

  return [view, update];
}

function urlFor(search: string): string {
  return `${window.location.pathname}${search}${window.location.hash}`;
}
