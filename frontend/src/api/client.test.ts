import { describe, expect, it, vi } from "vitest";

import { mockApi } from "../test/fixtures";
import { api, ApiError, csvUrl, toQuery, type AnalysisParams } from "./client";

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
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    const m = await api.metrics(params, 90);
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
    await expect(api.metrics(params, 90)).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "dates must be within",
    });
  });

  it("falls back to a generic message for non-JSON errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 502 }));
    const err = await api.meta().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Request failed (502)");
  });
});
