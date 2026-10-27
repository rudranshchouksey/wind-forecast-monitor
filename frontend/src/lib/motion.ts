import { useEffect, useState } from "react";

/** Motion tokens (docs/design.md §6), mirrored as CSS variables in index.css. */
export const duration = { fast: 0.15, base: 0.22, slow: 0.35, draw: 0.4 } as const;
export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};
/** Close to cubic-bezier(0.22, 1, 0.36, 1) (ease.out), for hand-written tweens. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Delay between cards entering on first load. */
export const STAGGER_S = 0.04;

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

/** True when the user asks for reduced motion; follows changes to the OS setting live. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => {
      setReduced(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, []);
  return reduced;
}

// First-load-only effects (card entry, line draw-in) check this once per page view.
let firstLoadDone = false;
let firstLoadTimer: ReturnType<typeof setTimeout> | undefined;

/** Whether the first-load window (about one second after the dashboard mounts) is still open. */
export function isFirstLoad(): boolean {
  return !firstLoadDone;
}

/** Closes the first-load window shortly after the dashboard has rendered with data. */
export function endFirstLoadSoon(ms = 1200) {
  if (firstLoadDone || firstLoadTimer) return;
  firstLoadTimer = setTimeout(() => {
    firstLoadDone = true;
  }, ms);
}

/** Test helper. */
export function resetFirstLoadForTests() {
  firstLoadDone = false;
  clearTimeout(firstLoadTimer);
  firstLoadTimer = undefined;
}
