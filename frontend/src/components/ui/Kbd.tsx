import type { ReactNode } from "react";

import { cx } from "./cx";

/** A keyboard key, e.g. in the shortcut help. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line-strong bg-raised px-1 font-mono text-micro text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
