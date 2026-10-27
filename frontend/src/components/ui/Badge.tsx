import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "warn";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-raised text-ink-2",
  accent: "border-accent/30 bg-accent-soft text-ink",
  warn: "border-transparent bg-warn-bg text-warn-ink",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** A leading status dot, in the accent colour. */
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-label font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />}
      {children}
    </span>
  );
}
