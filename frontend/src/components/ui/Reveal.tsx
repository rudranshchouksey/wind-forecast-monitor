import { useState, type ReactNode } from "react";

import { STAGGER_S, isFirstLoad, usePrefersReducedMotion } from "../../lib/motion";
import { cx } from "./cx";

/**
 * A short fade-and-rise for cards entering on first load only. A CSS animation (not a motion
 * component), so content can never be left hidden waiting for script. Later mounts and reduced
 * motion render without it, so filter changes never replay it.
 */
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const [animateIn] = useState(() => isFirstLoad() && !reduced);
  return (
    <div
      className={cx("min-w-0", animateIn && "reveal", className)}
      style={animateIn ? { animationDelay: `${index * STAGGER_S}s` } : undefined}
      data-reveal={animateIn ? "" : undefined}
    >
      {children}
    </div>
  );
}
