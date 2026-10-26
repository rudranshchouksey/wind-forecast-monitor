import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisParams } from "../api/client";
import { meta, metrics } from "../test/fixtures";
import { ChartCard } from "./ChartCard";
import { Controls } from "./Controls";
import { InsightCard } from "./InsightCard";
import { buildTiles } from "../lib/kpis";
import { KpiTiles } from "./KpiTiles";

const params: AnalysisParams = {
  from: "2026-01-02",
  to: "2026-01-03",
  mode: "cutoff",
  cutoffTime: "09:20",
  horizonH: 24,
};

describe("KpiTiles", () => {
  it("shows the five headline numbers", () => {
    render(<KpiTiles data={metrics} isLoading={false} />);
    expect(screen.getByText("Suggested buffer").nextSibling).toHaveTextContent("4,098 MW");
    expect(screen.getByText("Mean absolute error").nextSibling).toHaveTextContent("2,039 MW");
    expect(screen.getByText("RMSE").nextSibling).toHaveTextContent("2,505 MW");
    expect(screen.getByText("Bias").nextSibling).toHaveTextContent("+1,748 MW");
    expect(screen.getByText("P90 shortfall").nextSibling).toHaveTextContent("4,377 MW");
    expect(screen.getByText("Forecasts ran high on average")).toBeInTheDocument();
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
  function setup(overrides: Partial<AnalysisParams> = {}) {
    const onChange = vi.fn();
    const onPercentile = vi.fn();
    const onReset = vi.fn();
    render(
      <Controls
        meta={meta}
        params={{ ...params, ...overrides }}
        percentile={90}
        csvHref="/api/v1/forecast-vs-actual?format=csv"
        onChange={onChange}
        onPercentile={onPercentile}
        onReset={onReset}
      />,
    );
    return { onChange, onPercentile, onReset };
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

  it("moving the lead-time slider switches to horizon mode", () => {
    const { onChange } = setup();
    const slider = screen.getByRole("slider");
    // user-event cannot drag range inputs; fire the change directly.
    slider.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "12");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ ...params, horizonH: 12, mode: "horizon" });
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

describe("ChartCard", () => {
  const base = { title: "Chart", isLoading: false, error: null, isEmpty: false };

  it("toggles between chart and table", async () => {
    render(
      <ChartCard {...base} table={() => <table aria-label="numbers" />}>
        {() => <div>the chart</div>}
      </ChartCard>,
    );
    expect(screen.getByText("the chart")).toBeInTheDocument();
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
