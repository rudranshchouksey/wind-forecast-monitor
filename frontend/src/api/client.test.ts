import { describe, expect, it, vi } from "vitest";

import { mockApi } from "../test/fixtures";
import {
  api,
  ApiError,
  csvUrl,
  isUnreachable,
  toQuery,
  UNREACHABLE_MESSAGE,
  type AnalysisParams,
} from "./client";

const params: AnalysisParams = {
  from: "2026-01-02",
  to: "2026-01-03",
  mode: "cutoff",
  cutoffTime: "09:20",
  horizonH: 24,
};

describe("api client", () => {
  it("serialises params and only sends horizon in horizon mode", () => {
    expect(toQuery(params)).toBe("from=2026-01-02&to=2026-01-03&mode=cutoff&cutoff_time=09%3A20");
    expect(toQuery({ ...params, mode: "horizon" }, { percentile: 95 })).toContain(
      "horizon_h=24&percentile=95",
    );
    expect(csvUrl(params)).toMatch(/^\/api\/v1\/forecast-vs-actual\?.*format=csv/);
  });

  it("returns parsed JSON", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    const m = await api.metrics(params, 90, "random");
    expect(fetchSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining("buffer_basis=random"));
    expect(m.metrics.mae_mw).toBeCloseTo(2038.9);
  });

  it("raises ApiError with the problem detail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockApi({
        "/metrics": () =>
          new Response(
            JSON.stringify({ title: "Bad Request", status: 400, detail: "dates must be within" }),
            {
              status: 400,
            },
          ),
      }),
    );
    await expect(api.metrics(params, 90, "total")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "dates must be within",
    });
  });

  it("requests the correction endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    const c = await api.correction(params);
    expect(c.mae_change_pct).toBeCloseTo(-23.1);
  });

  it("falls back to a generic message for other non-JSON errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 404 }));
    const err = await api.meta().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "Request failed (404)", unreachable: false });
  });

  it.each([500, 502, 503, 504])(
    "treats a %i without a problem+json body as an unreachable backend",
    async (status) => {
      // What the Vite proxy sends when nothing listens on :8000: a 500 with an empty body.
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
      const err = await api.meta().catch((e: unknown) => e);
      expect(err).toMatchObject({ status, unreachable: true, message: UNREACHABLE_MESSAGE });
      expect(isUnreachable(err)).toBe(true);
    },
  );

  it("treats a network failure as an unreachable backend", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.meta().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, unreachable: true, message: UNREACHABLE_MESSAGE });
  });

  it("keeps problem+json title and detail for real server errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ title: "Bad Gateway", status: 502, detail: "Elexon API request failed" }),
        { status: 502, headers: { "Content-Type": "application/problem+json" } },
      ),
    );
    const err = await api.meta().catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 502,
      unreachable: false,
      title: "Bad Gateway",
      message: "Elexon API request failed",
    });
  });

  it("rethrows aborts instead of reporting the API as unreachable", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));
    const err = await api.meta(controller.signal).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(isUnreachable(err)).toBe(false);
  });
});
