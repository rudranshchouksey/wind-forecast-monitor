import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildTiles } from "../lib/kpis";
import { snapshotLabel, settingsSummary } from "../lib/labels";
import { byDay, meta, metrics } from "../test/fixtures";
import { KpiTiles } from "./KpiTiles";
import { Sparkline } from "./Sparkline";

const points = [
  { key: "2026-01-02", value: 1000 },
  { key: "2026-01-03", value: 3000 },
  { key: "2026-01-04", value: 2000 },
];

describe("Sparkline", () => {
  it("names its statistic in the visible label, the tooltip and the aria label", () => {
    render(<Sparkline points={points} label="Daily P90 shortfall" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName(
      "Daily P90 shortfall, 3 delivery days from Fri 2 Jan to Sun 4 Jan: lowest 1,000 MW, highest 3,000 MW",
    );
    expect(img.querySelector("title")).toHaveTextContent("Daily P90 shortfall");
    expect(screen.getByText("Daily P90 shortfall", { selector: "figcaption" })).toBeInTheDocument();
  });

  it("shows the hovered day and value with the statistic's name", () => {
    render(<Sparkline points={points} label="Daily MAE" />);
    const img = screen.getByRole("img");
    img.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    // jsdom has no PointerEvent; a MouseEvent of the same type carries clientX.
    fireEvent(img, new MouseEvent("pointermove", { bubbles: true, clientX: 50 }));
    expect(img.parentElement?.querySelector("figcaption")).toHaveTextContent(
      "Sat 3 Jan · 3,000 MW daily mae",
    );
    fireEvent.pointerLeave(img);
    expect(img.parentElement?.querySelector("figcaption")).toHaveTextContent("Daily MAE");
  });

  it("renders nothing with fewer than two values", () => {
    const { container } = render(<Sparkline points={points.slice(0, 1)} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("KPI sparklines", () => {
  it("draws one per tile from the by-day rows, with the agreed statistics", () => {
    render(<KpiTiles data={metrics} isLoading={false} daily={byDay.rows} />);
    const names = screen.getAllByRole("img").map((i) => i.querySelector("title")?.textContent);
    expect(names).toEqual([
      "Daily P90 shortfall",
      "Daily MAE",
      "Daily RMSE",
      "Daily bias (forecast − actual)",
      "Daily max shortfall",
    ]);
  });

  it("says the headline number covers the whole period where the daily statistic differs", () => {
    const [buffer, mae, , , worst] = buildTiles(metrics);
    expect(buffer?.definition).toContain(
      "The headline number covers the whole period; the sparkline shows the daily p90 shortfall",
    );
    expect(worst?.definition).toContain("the sparkline shows the daily max shortfall");
    expect(mae?.definition).not.toContain("headline number");
  });
});

describe("labels", () => {
  it("formats the snapshot badge and the settings summary", () => {
    expect(snapshotLabel(meta)).toBe("Elexon snapshot · Jan 2026");
    expect(
      settingsSummary({
        params: { from: "", to: "", mode: "cutoff", cutoffTime: "09:20", horizonH: 24 },
        percentile: 90,
        basis: "total",
      }),
    ).toBe("09:20 D-1 · P90 · incl. offset");
    expect(
      settingsSummary({
        params: { from: "", to: "", mode: "horizon", cutoffTime: "09:20", horizonH: 6 },
        percentile: 95,
        basis: "random",
      }),
    ).toBe("6 h ahead · P95 · random only");
  });
});
