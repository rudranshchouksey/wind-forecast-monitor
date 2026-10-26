import { describe, expect, it } from "vitest";

import { extent, niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("covers the data with round steps", () => {
    expect(niceTicks(0, 21353)).toEqual([0, 5000, 10000, 15000, 20000, 25000]);
    expect(niceTicks(0, 5100)).toEqual([0, 2000, 4000, 6000]);
    expect(niceTicks(-730, 5375)).toEqual([-2000, 0, 2000, 4000, 6000]);
  });

  it("handles flat, reversed and invalid input", () => {
    expect(niceTicks(0, 0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(10, 0)).toEqual(niceTicks(0, 10));
    expect(niceTicks(Number.NaN, 1)).toEqual([0]);
  });

  it("computes extents ignoring nulls", () => {
    expect(extent([3, null, -1, 7])).toEqual([-1, 7]);
    expect(extent([null])).toEqual([0, 0]);
  });
});
