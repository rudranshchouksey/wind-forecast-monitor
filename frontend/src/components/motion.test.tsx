import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { endFirstLoadSoon, resetFirstLoadForTests } from "../lib/motion";
import { AnimatedNumber, Reveal } from "./ui";

/** Make matchMedia report prefers-reduced-motion: reduce. */
function reduceMotion() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

const fmt = (v: number | null) =>
  v === null ? "–" : `${Math.round(v).toLocaleString("en-GB")} MW`;

afterEach(() => {
  resetFirstLoadForTests();
  vi.useRealTimers();
});

describe("AnimatedNumber", () => {
  it("shows the first value immediately, then tweens to a new one", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { rerender } = render(<AnimatedNumber value={1000} format={fmt} />);
    expect(screen.getByText("1,000 MW")).toBeInTheDocument();

    rerender(<AnimatedNumber value={2000} format={fmt} />);
    // Starts from the old value...
    expect(screen.getByText("1,000 MW")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const mid = Number(screen.getByText(/MW$/).textContent.replace(/[^\d]/g, ""));
    expect(mid).toBeGreaterThan(1000);
    expect(mid).toBeLessThan(2000);
    // ...and lands exactly on the new one.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("2,000 MW")).toBeInTheDocument();
  });

  it("jumps straight to the new value under reduced motion", () => {
    reduceMotion();
    const { rerender } = render(<AnimatedNumber value={1000} format={fmt} />);
    rerender(<AnimatedNumber value={2000} format={fmt} />);
    expect(screen.getByText("2,000 MW")).toBeInTheDocument();
  });

  it("formats null as a dash", () => {
    render(<AnimatedNumber value={null} format={fmt} />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});

describe("Reveal", () => {
  it("animates on first load with a staggered delay", () => {
    render(
      <Reveal index={3}>
        <p>card</p>
      </Reveal>,
    );
    const wrap = screen.getByText("card").parentElement;
    expect(wrap).toHaveClass("reveal");
    expect(wrap?.style.animationDelay).toBe("0.12s");
  });

  it("does not animate after the first-load window", () => {
    vi.useFakeTimers();
    endFirstLoadSoon(10);
    vi.advanceTimersByTime(20);
    render(
      <Reveal>
        <p>card</p>
      </Reveal>,
    );
    expect(screen.getByText("card").parentElement).not.toHaveClass("reveal");
  });

  it("does not animate under reduced motion", () => {
    reduceMotion();
    render(
      <Reveal>
        <p>card</p>
      </Reveal>,
    );
    expect(screen.getByText("card").parentElement).not.toHaveClass("reveal");
  });
});
