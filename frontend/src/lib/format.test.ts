import { describe, expect, it } from "vitest";

import {
  formatDeliveryDay,
  formatGwTick,
  formatHourOfDay,
  formatHours,
  formatLondon,
  formatMw,
  formatPct,
} from "./format";

describe("format", () => {
  it("formats MW with grouping and optional sign", () => {
    expect(formatMw(4097.9)).toBe("4,098 MW");
    expect(formatMw(1747.9, { signed: true })).toBe("+1,748 MW");
    expect(formatMw(-12, { signed: true })).toBe("−12 MW");
    expect(formatMw(-12)).toBe("−12 MW");
    expect(formatMw(0, { signed: true })).toBe("0 MW");
    expect(formatMw(null)).toBe("–");
    expect(formatMw(Number.NaN)).toBe("–");
  });

  it("formats axis ticks in GW", () => {
    expect(formatGwTick(5000)).toBe("5");
    expect(formatGwTick(2500)).toBe("2.5");
  });

  it("formats percentages and hours", () => {
    expect(formatPct(0.899)).toBe("90%");
    expect(formatPct(null)).toBe("–");
    expect(formatHours(28)).toBe("28 h");
    expect(formatHours(16.5)).toBe("16.5 h");
    expect(formatHours(undefined)).toBe("–");
  });

  it("renders times in Europe/London, including BST", () => {
    expect(formatLondon("2026-01-02T09:30:00Z")).toContain("09:30");
    // 08:30 UTC in July is 09:30 BST.
    expect(formatLondon("2026-07-02T08:30:00Z")).toContain("09:30");
  });

  it("formats delivery day keys and hours of day", () => {
    expect(formatDeliveryDay("2026-01-02")).toBe("Fri 2 Jan");
    expect(formatHourOfDay("7")).toBe("07:00");
  });
});
