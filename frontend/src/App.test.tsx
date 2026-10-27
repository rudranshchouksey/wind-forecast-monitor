import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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

  it("starts dark (dark-first) and toggles the theme", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
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

  it("opens a view from the URL and writes control changes back to it", async () => {
    window.history.replaceState(null, "", "/?cutoff=09:50&basis=random&p=95");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    expect(screen.getByLabelText(/Decision cutoff/)).toHaveValue("09:50");
    expect(screen.getByLabelText("Random error only")).toBeChecked();
    expect(screen.getByLabelText("Buffer covers")).toHaveValue("95");
    expect(
      fetchSpy.mock.calls.some(
        ([u]) =>
          typeof u === "string" &&
          u.includes("/metrics?") &&
          u.includes("cutoff_time=09%3A50") &&
          u.includes("percentile=95") &&
          u.includes("buffer_basis=random"),
      ),
    ).toBe(true);

    await userEvent.click(screen.getByLabelText("Include systematic offset"));
    expect(window.location.search).toBe("?cutoff=09%3A50&p=95");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(window.location.search).toBe("");
  });

  it("restores the controls on Back", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    await userEvent.click(screen.getByLabelText("At fixed lead time"));
    expect(window.location.search).toBe("?mode=horizon");
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByLabelText("At decision cutoff")).toBeChecked();
  });

  it("supports keyboard shortcuts and a help overlay", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);

    await userEvent.keyboard("2");
    expect(screen.getByLabelText(/Decision cutoff/)).toHaveValue("09:50");
    await userEvent.keyboard("m");
    expect(screen.getByLabelText("At fixed lead time")).toBeChecked();
    await userEvent.keyboard("b");
    expect(screen.getByLabelText("Random error only")).toBeChecked();
    expect(screen.getByText("Random error only", { selector: "p" })).toBeInTheDocument();
    await userEvent.keyboard("r");
    expect(window.location.search).toBe("");

    const opener = screen.getByRole("button", { name: "Keyboard shortcuts" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveTextContent("Cutoff: Nord Pool N2EX (09:50)");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    // Shortcuts are paused while the dialog is open.
    await userEvent.keyboard("m");
    expect(screen.getByLabelText("At decision cutoff")).toBeChecked();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();

    await userEvent.keyboard("?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ignores shortcuts while typing in a field", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(mockApi());
    renderApp();
    await screen.findByText(/plan on 4,098 MW less wind/);
    screen.getByLabelText(/Decision cutoff/).focus();
    await userEvent.keyboard("m");
    expect(screen.getByLabelText("At decision cutoff")).toBeChecked();
  });
});
