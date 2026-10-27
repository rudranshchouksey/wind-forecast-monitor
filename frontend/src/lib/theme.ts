import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * Chart colours as CSS variable references (docs/design.md §2). SVG presentation attributes
 * resolve var() at paint time, so every chart follows the theme with no hex values in components.
 */
export const chart = {
  actual: "var(--actual)",
  forecast: "var(--forecast)",
  corrected: "var(--corrected)",
  shortfall: "var(--shortfall)",
  surplus: "var(--surplus)",
  gapFill: "var(--gap-fill)",
  grid: "var(--grid)",
  axis: "var(--axis)",
  panel: "var(--panel)",
  raised: "var(--raised)",
  text: "var(--text)",
  text2: "var(--text-2)",
  muted: "var(--text-muted)",
  accent: "var(--accent)",
} as const;

/** Resolved value of a token, for canvas drawing where var() is not available. */
export function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Dark-first: dark unless the OS asks for light.
function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

// One module-level store, so the header toggle and the "t" shortcut share the same state.
let current: Theme | null = null;
const listeners = new Set<() => void>();

function get(): Theme {
  current ??= storedTheme() ?? systemTheme();
  return current;
}

function apply(t: Theme) {
  current = t;
  document.documentElement.dataset.theme = t;
  for (const l of listeners) l();
}

export function toggleTheme() {
  const next: Theme = get() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable: the choice lasts for this page view */
  }
  apply(next);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Test helper: forget the in-memory choice so the next read starts from storage and the OS. */
export function resetThemeForTests() {
  current = null;
  delete document.documentElement.dataset.theme;
}

/** Follows the OS until the user picks; the choice is remembered per browser. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, get, (): Theme => "dark");
  if (typeof document !== "undefined" && document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
  }
  const toggle = useCallback(() => {
    toggleTheme();
  }, []);
  return [theme, toggle];
}
