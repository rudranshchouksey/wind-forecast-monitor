import { describe, expect, it } from "vitest";

import { formatGwSigned, levelGrowthSentence } from "./diagnostics";

const bucket = (label: string, bias_mw: number | null, n = 10) => ({
  label,
  n,
  bias_mw,
  mean_ratio: null,
});

describe("diagnostics helpers", () => {
  it("formats signed GW", () => {
    expect(formatGwSigned(539)).toBe("+0.5 GW");
    expect(formatGwSigned(-730)).toBe("−0.7 GW");
    expect(formatGwSigned(null)).toBe("–");
  });

  it("describes growth from the first to the last populated bucket", () => {
    expect(
      levelGrowthSentence([
        bucket("0-5 GW", 539),
        bucket("5-10 GW", 770),
        bucket("15-30 GW", 2683),
        bucket("30-40 GW", null, 0),
      ]),
    ).toBe(
      "The bias grows with forecast level: +0.5 GW when the forecast is 0–5 GW, rising to +2.7 GW at 15–30 GW.",
    );
  });

  it("says nothing when the bias does not rise or data is missing", () => {
    expect(levelGrowthSentence([bucket("0-5 GW", 900), bucket("15-30 GW", 100)])).toBeNull();
    expect(levelGrowthSentence([bucket("0-5 GW", 900)])).toBeNull();
    expect(levelGrowthSentence([])).toBeNull();
  });
});
