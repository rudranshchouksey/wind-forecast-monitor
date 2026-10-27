import type { ReactNode } from "react";

import { cx } from "./cx";
import { InfoTip } from "./Tooltip";

export interface StatProps {
  label: string;
  /** The definition behind the ⓘ button. */
  definition?: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** A small visual under the note, e.g. a sparkline. */
  extra?: ReactNode;
  primary?: boolean;
  /** Marker shown next to the label of the primary stat. */
  badge?: ReactNode;
  className?: string;
}

/**
 * One KPI tile, as a dt/dd group inside a parent <dl>. The tile is `relative`, so the definition
 * popover is contained by it.
 */
export function Stat({
  label,
  definition,
  value,
  note,
  extra,
  primary = false,
  badge,
  className,
}: StatProps) {
  return (
    <div
      className={cx(
        "relative flex min-w-0 flex-col rounded-card border bg-panel p-4 shadow-card",
        primary
          ? "border-accent/40 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-card before:bg-accent"
          : "border-line",
        className,
      )}
    >
      <dt className="flex items-center gap-1 text-label font-medium text-ink-2">
        {label}
        {definition && <InfoTip label={label} text={definition} />}
        {badge && <span className="ml-auto">{badge}</span>}
      </dt>
      <dd
        className={cx(
          "mt-2 font-mono font-medium tracking-tight text-ink",
          primary ? "text-[1.875rem] leading-9" : "text-stat",
        )}
      >
        {value}
      </dd>
      {note && <dd className="mt-1 text-label text-muted">{note}</dd>}
      {extra && <dd className="mt-auto pt-3">{extra}</dd>}
    </div>
  );
}
