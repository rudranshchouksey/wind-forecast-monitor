import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisParams } from "../api/client";
import type { BufferBasis } from "../api/types";
import { bufferLineLabel, buildTiles } from "../lib/kpis";
import { bias, correction, meta, metrics } from "../test/fixtures";
import { ChartCard } from "./ChartCard";
import { Controls } from "./Controls";
import { BiasNote, CorrectionPanel } from "./Diagnostics";
import { InsightCard } from "./InsightCard";
import { KpiTiles } from "./KpiTiles";

const params: AnalysisParams = {
  from: "2026-01-02",
  to: "2026-01-03",
  mode: "cutoff",
  cutoffTime: "09:20",
  horizonH: 24,
};

const randomMetrics = {
  ...metrics,
  insight: {
    ...metrics.insight,
    basis: "random" as const,
    buffer_mw: 2350,
    coverage_vs_fuelhh: 0.68,
  },
};

describe("KpiTiles", () => {
  const value = (label: string) =>
    screen.getByText(label, { selector: "dt" }).parentElement?.querySelector("dd");

  it("shows the five headline numbers, with worst 1% instead of P90 shortfall", () => {
    render(<KpiTiles data={metrics} isLoading={false} />);
    expect(value("Suggested buffer (P90)")).toHaveTextContent("4,098 MW");
    expect(value("Mean absolute error")).toHaveTextContent("2,039 MW");
    expect(value("RMSE")).toHaveTextContent("2,505 MW");
    expect(value("Bias")).toHaveTextContent("+1,748 MW");
    expect(value("Worst 1% of hours")).toHaveTextContent("6,261 MW");
    expect(screen.queryByText("P90 shortfall")).toBeNull();
    expect(screen.getByText("Forecasts ran high on average")).toBeInTheDocument();
  });

  it("gives every tile an accessible definition tooltip", async () => {
    render(<KpiTiles data={metrics} isLoading={false} />);
    const buttons = screen.getAllByRole("button", { name: /^About / });
    expect(buttons).toHaveLength(5);
    for (const b of buttons) {
      const tip = document.getElementById(b.getAttribute("aria-describedby") ?? "");
      expect(tip).toHaveAttribute("role", "tooltip");
      expect(tip).toHaveTextContent(/.{40,}/);
    }
    const worst = screen.getByRole("button", { name: "About Worst 1% of hours" });
    expect(worst).toHaveAccessibleDescription(/99th percentile of hourly error/);
    await userEvent.hover(worst);
    expect(worst).toHaveAttribute("aria-expanded", "true");
    await userEvent.unhover(worst);
    expect(worst).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(worst);
    expect(worst).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(worst, { key: "Escape" });
    expect(worst).toHaveAttribute("aria-expanded", "false");
  });

  it("buffer and worst-1% definitions use the same population", () => {
    const [buffer, , , , worst] = buildTiles(metrics);
    expect(buffer?.definition).toContain("across all evaluated hours");
    expect(worst?.definition).toContain("across all evaluated hours");
  });

  it("describes the random-only buffer differently", () => {
    const [buffer] = buildTiles(randomMetrics);
    expect(buffer?.value).toBe("2,350 MW");
    expect(buffer?.note).toContain("Random error only");
    expect(buffer?.note).toContain("68% of hours vs FUELHH");
    expect(buffer?.definition).toContain("excludes the persistent offset");
  });

  it("explains a negative bias in words", () => {
    const tiles = buildTiles({ ...metrics, metrics: { ...metrics.metrics, bias_mw: -10 } });
    expect(tiles.find((t) => t.label === "Bias")?.note).toBe("Forecasts ran low on average");
  });

  it("renders placeholders while loading", () => {
    const { container } = render(<KpiTiles data={undefined} isLoading />);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});

describe("bufferLineLabel", () => {
  it("names the basis on the histogram line", () => {
    expect(bufferLineLabel(4097.9, "total")).toBe("buffer incl. offset 4,098 MW");
    expect(bufferLineLabel(2350, "random")).toBe("random-only buffer 2,350 MW");
  });
});

describe("InsightCard", () => {
  it("shows the takeaway and the caveat as a labelled note", () => {
    render(<InsightCard data={metrics} />);
    expect(screen.getByText(/plan on 4,098 MW less wind/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Caveat: Most of this buffer is a persistent offset.",
    );
    expect(screen.getByText(/at 09:20 London the day before delivery/)).toBeInTheDocument();
  });

  it("omits the caveat when there is none", () => {
    render(<InsightCard data={{ ...metrics, insight: { ...metrics.insight, caveat: null } }} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Controls", () => {
  function setup(overrides: Partial<AnalysisParams> = {}, basis: BufferBasis = "total") {
    const onChange = vi.fn();
    const onPercentile = vi.fn();
    const onBasis = vi.fn();
    const onReset = vi.fn();
    render(
      <Controls
        meta={meta}
        params={{ ...params, ...overrides }}
        percentile={90}
        basis={basis}
        csvHref="/api/v1/forecast-vs-actual?format=csv"
        onChange={onChange}
        onPercentile={onPercentile}
        onBasis={onBasis}
        onReset={onReset}
      />,
    );
    return { onChange, onPercentile, onBasis, onReset };
  }

  it("offers the three cutoff presets with 09:20 selected", () => {
    setup();
    const select = screen.getByLabelText(/Decision cutoff/);
    expect(select).toHaveValue("09:20");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["EPEX GB hourly (09:20)", "Nord Pool N2EX (09:50)", "Legacy 11:00"]);
  });

  it("changing the cutoff emits new params", async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText(/Decision cutoff/), "11:00");
    expect(onChange).toHaveBeenCalledWith({ ...params, cutoffTime: "11:00" });
  });

  it("disables the lead-time slider with a hint unless fixed lead time is selected", () => {
    setup();
    const slider = screen.getByRole("slider");
    expect(slider).toBeDisabled();
    expect(slider).toHaveAccessibleDescription("Select “At fixed lead time” to use the slider");
  });

  it("enables the slider in horizon mode without changing the mode", () => {
    const { onChange } = setup({ mode: "horizon" });
    const slider = screen.getByRole("slider");
    expect(slider).toBeEnabled();
    expect(screen.queryByText(/to use the slider/)).toBeNull();
    fireEvent.change(slider, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith({ ...params, mode: "horizon", horizonH: 12 });
  });

  it("buffer basis toggle defaults to including the offset", async () => {
    const { onBasis } = setup();
    expect(screen.getByLabelText("Include systematic offset")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Random error only"));
    expect(onBasis).toHaveBeenCalledWith("random");
  });

  it("mode radios, percentile, reset and CSV link", async () => {
    const { onChange, onPercentile, onReset } = setup();
    await userEvent.click(screen.getByLabelText("At fixed lead time"));
    expect(onChange).toHaveBeenCalledWith({ ...params, mode: "horizon" });
    await userEvent.selectOptions(screen.getByLabelText("Buffer covers"), "95");
    expect(onPercentile).toHaveBeenCalledWith(95);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/api/v1/forecast-vs-actual?format=csv",
    );
  });

  it("disables the cutoff picker in horizon mode", () => {
    setup({ mode: "horizon" });
    expect(screen.getByLabelText(/Decision cutoff/)).toBeDisabled();
  });
});

describe("BiasNote", () => {
  it("states the level growth explicitly and lists unconfirmed hypotheses", () => {
    render(<BiasNote data={bias} />);
    expect(
      screen.getByText(
        "The bias grows with forecast level: +0.5 GW when the forecast is 0–5 GW, rising to +2.7 GW at 15–30 GW.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/\+0\.4 GW to \+2\.7 GW/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /unconfirmed hypotheses/i })).toBeInTheDocument();
    expect(screen.getByText("Curtailment at high wind.")).toBeInTheDocument();
    expect(screen.getByText("Capacity counted in WINDFOR but not in FUELHH.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /by level/ });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });
});

describe("CorrectionPanel", () => {
  it("shows raw vs corrected accuracy and toggles the chart series", async () => {
    const onToggle = vi.fn();
    render(<CorrectionPanel data={correction} show={false} onToggle={onToggle} available />);
    expect(screen.getByText("2,039 MW → 1,568 MW (−23%)")).toBeInTheDocument();
    expect(screen.getByText("2,505 MW → 2,017 MW (−19%)")).toBeInTheDocument();
    expect(screen.getByText(/7 complete days before the decision/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Show on main chart"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("explains when it is unavailable or has no history", () => {
    const { rerender } = render(
      <CorrectionPanel data={correction} show={false} onToggle={vi.fn()} available={false} />,
    );
    expect(screen.getByText(/only defined at the decision cutoff/)).toBeInTheDocument();
    rerender(
      <CorrectionPanel
        data={{ ...correction, days_corrected: 0 }}
        show={false}
        onToggle={vi.fn()}
        available
      />,
    );
    expect(screen.getByText("Not enough past days to fit a correction.")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  const base = { title: "Chart", isLoading: false, error: null, isEmpty: false };

  it("toggles between chart and table and shows the unit above the plot", async () => {
    render(
      <ChartCard {...base} unit="GW" table={() => <table aria-label="numbers" />}>
        {() => <div>the chart</div>}
      </ChartCard>,
    );
    expect(screen.getByText("the chart")).toBeInTheDocument();
    expect(screen.getByText("GW")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show table" }));
    expect(screen.getByRole("table", { name: "numbers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show chart" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders loading, empty and error states", async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ChartCard {...base} isLoading>
        {() => null}
      </ChartCard>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading Chart");
    rerender(
      <ChartCard {...base} isEmpty>
        {() => null}
      </ChartCard>,
    );
    expect(screen.getByText(/No hours to show/)).toBeInTheDocument();
    rerender(
      <ChartCard {...base} error={new Error("boom")} onRetry={retry}>
        {() => null}
      </ChartCard>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});
