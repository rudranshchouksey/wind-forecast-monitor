import type { CSSProperties } from "react";

import { cx } from "./cx";

/** A shimmering placeholder block; compose several to match the shape of what is loading. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={cx("skeleton rounded-control", className)} style={style} />
  );
}
