import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetThemeForTests } from "../lib/theme";

// jsdom lacks these browser APIs used by Recharts and the theme hook.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

afterEach(() => {
  cleanup();
  resetThemeForTests();
  // URL state persists across tests in one file; start each test from a clean address.
  window.history.replaceState(null, "", "/");
  try {
    localStorage.clear();
  } catch {
    /* no storage */
  }
  vi.restoreAllMocks();
});
