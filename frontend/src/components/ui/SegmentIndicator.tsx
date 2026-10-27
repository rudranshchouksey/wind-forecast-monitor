import { m } from "motion/react";

import { duration, ease } from "../../lib/motion";

/**
 * The selected-segment background, shared across a group by layoutId so it slides to the new
 * option (MotionConfig reducedMotion="user" turns the slide off).
 */
export function SegmentIndicator({ layoutId }: { layoutId: string }) {
  return (
    <m.span
      layoutId={layoutId}
      aria-hidden="true"
      className="absolute inset-0 rounded-[4px] border border-line-strong bg-raised"
      transition={{ duration: duration.base, ease: ease.inOut }}
    />
  );
}
