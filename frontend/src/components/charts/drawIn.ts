import { useEffect, useState } from "react";

import { isFirstLoad, prefersReducedMotion } from "../../lib/motion";

/** Line draw-in duration (the `draw` motion token, docs/design.md §6). */
export const DRAW_MS = 400;

/**
 * True for a chart's first render during the first page load (and never under reduced motion),
 * then false, so later data changes swap instantly instead of replaying the draw.
 */
export function useDrawOnce(): boolean {
  const [draw, setDraw] = useState(() => isFirstLoad() && !prefersReducedMotion());
  useEffect(() => {
    if (!draw) return;
    const id = setTimeout(() => {
      setDraw(false);
    }, DRAW_MS + 150);
    return () => {
      clearTimeout(id);
    };
  }, [draw]);
  return draw;
}
