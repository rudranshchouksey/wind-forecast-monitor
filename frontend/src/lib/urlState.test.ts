import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { meta } from "../test/fixtures";
import { defaultView, parseView, serializeView, useUrlState, type ViewState } from "./urlState";

const custom: ViewState = {
  params: {
    from: "2026-01-03",
    to: "2026-01-03",
    mode: "horizon",
    cutoffTime: "09:50",
    horizonH: 12,
  },
  percentile: 95,
  basis: "random",
  corrected: true,
};

describe("serializeView / parseView", () => {
  it("writes nothing for the default view", () => {
    expect(serializeView(defaultView(meta), meta)).toBe("");
    expect(parseView("", meta)).toEqual(defaultView(meta));
  });

  it("round-trips every control", () => {
    const search = serializeView(custom, meta);
    expect(search).toBe(
      "?from=2026-01-03&mode=horizon&cutoff=09%3A50&h=12&p=95&basis=random&corrected=1",
    );
    expect(parseView(search, meta)).toEqual(custom);
  });

  it("falls back per key on invalid values", () => {
    const v = parseView(
      "?from=2025-12-01&to=nope&mode=weird&cutoff=10:00&h=500&p=42&basis=x&corrected=yes",
      meta,
    );
    expect(v).toEqual(defaultView(meta));
  });

  it("resets an inverted date range but keeps other valid keys", () => {
    const v = parseView("?from=2026-01-03&to=2026-01-02&p=80", meta);
    expect(v.params.from).toBe(meta.first_day);
    expect(v.params.to).toBe(meta.last_day);
    expect(v.percentile).toBe(80);
  });
});

describe("useUrlState", () => {
  it("pushes discrete changes, replaces continuous ones, and follows Back", () => {
    window.history.replaceState(null, "", "/");
    const start = window.history.length;
    const { result } = renderHook(() => useUrlState(meta));
    expect(result.current[0]).toEqual(defaultView(meta));

    act(() => {
      result.current[1]({ ...result.current[0], basis: "random" });
    });
    expect(window.location.search).toBe("?basis=random");
    expect(window.history.length).toBe(start + 1);

    act(() => {
      const v = result.current[0];
      result.current[1]({ ...v, params: { ...v.params, horizonH: 30 } }, { replace: true });
    });
    expect(window.location.search).toBe("?h=30&basis=random");
    expect(window.history.length).toBe(start + 1);

    // Simulate Back: the address changes, then popstate fires.
    act(() => {
      window.history.replaceState(null, "", "/?basis=random");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0].params.horizonH).toBe(24);
    expect(result.current[0].basis).toBe("random");
  });

  it("normalises a shared link with invalid or default keys", () => {
    window.history.replaceState(null, "", "/?p=90&basis=random&h=999");
    renderHook(() => useUrlState(meta));
    expect(window.location.search).toBe("?basis=random");
  });
});
