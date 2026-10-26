import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { defaultParams } from "./lib/params";
import { meta, mockApi } from "./test/fixtures";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  it("loads metadata then renders KPIs, takeaway and every chart section", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
    expect(await screen.findByText(/plan on 4,098 MW less wind/)).toBeInTheDocument();
    for (const title of [
      "Actual vs forecast",
      "Error by forecast lead time",
      "Error distribution",
      "Error by hour of day",
      "Bias by delivery day",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("How to read this")).toBeInTheDocument();
    expect(await screen.findByText(/Is the bias forecast error/)).toBeInTheDocument();
  });

  it("shows an error with retry when the API is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockApi({
        "/meta": () =>
          new Response(
            JSON.stringify({
              title: "Service Unavailable",
              status: 503,
              detail: "no data ingested",
            }),
            { status: 503 },
          ),
      }),
    );
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("no data ingested");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says the backend can't be reached when the dev proxy answers 500, then recovers", async () => {
    let backendUp = false;
    const healthy = mockApi();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      backendUp ? healthy(input) : Promise.resolve(new Response(null, { status: 500 })),
    );
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Can't reach the API. Is the backend running on :8000?");
    expect(alert).not.toHaveTextContent("Request failed (500)");
    backendUp = true;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/plan on 4,098 MW less wind/)).toBeInTheDocument();
  });

  it("refetches metrics when the cutoff changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    await userEvent.selectOptions(screen.getByLabelText(/Decision cutoff/), "09:50");
    await vi.waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([u]) =>
            typeof u === "string" && u.includes("/metrics?") && u.includes("cutoff_time=09%3A50"),
        ),
      ).toBe(true);
    });
  });

  it("switching the buffer basis refetches metrics with buffer_basis=random", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    await userEvent.click(screen.getByLabelText("Random error only"));
    await vi.waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([u]) => typeof u === "string" && u.includes("buffer_basis=random"),
        ),
      ).toBe(true);
    });
  });

  it("shows the correction panel and adds the corrected series to the legend", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    expect(await screen.findByText("2,039 MW → 1,568 MW (−23%)")).toBeInTheDocument();
    expect(screen.queryByText("Bias-corrected forecast", { selector: "li" })).toBeNull();
    await userEvent.click(screen.getByLabelText("Show on main chart"));
    expect(screen.getByText("Bias-corrected forecast", { selector: "li" })).toBeInTheDocument();
  });

  it("does not request the correction in horizon mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    await userEvent.click(screen.getByLabelText("At fixed lead time"));
    expect(await screen.findByText(/only defined at the decision cutoff/)).toBeInTheDocument();
    const horizonCorrection = fetchSpy.mock.calls.some(
      ([u]) =>
        typeof u === "string" && u.includes("/metrics/correction") && u.includes("mode=horizon"),
    );
    expect(horizonCorrection).toBe(false);
  });

  it("toggles the theme", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("derives defaults from metadata", () => {
    expect(defaultParams(meta)).toEqual({
      from: "2026-01-02",
      to: "2026-01-03",
      mode: "cutoff",
      cutoffTime: "09:20",
      horizonH: 24,
    });
  });
});
