import { useLayoutEffect, useRef } from "react";

import { duration, easeOut, usePrefersReducedMotion } from "../../lib/motion";

export interface AnimatedNumberProps {
  value: number | null;
  format: (v: number | null) => string;
  className?: string;
}

/**
 * A number that tweens to each new value. The first value (and every value under reduced motion)
 * appears immediately. The text is written straight to the DOM node, so a tween never re-renders
 * React, and React never owns the text node it would fight over.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    const fmt = formatRef.current;
    if (reduced || from === null || value === null || from === value) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    el.textContent = fmt(from);
    // A plain rAF tween: a few lines instead of pulling an animation engine into the first load.
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / (duration.slow * 1000));
      const v = t >= 1 ? value : from + (value - from) * easeOut(t);
      shown.current = v;
      el.textContent = fmt(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [value, reduced]);

  // Rounded during the tween too: formatters already round to whole MW.
  return <span ref={ref} className={className} />;
}
