import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared chart tooltip body: title, then value-first rows keyed by short line swatches. */
export function TooltipBox({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-48 rounded-control bg-panel px-3 py-2.5 text-label shadow-pop">
      <p className="mb-2 font-medium text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color ? (
              <span
                aria-hidden="true"
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: r.color }}
              />
            ) : (
              <span aria-hidden="true" className="w-3 shrink-0" />
            )}
            <span className="min-w-[5.5rem] font-mono font-medium text-ink">{r.value}</span>
            <span className="text-ink-2">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-2 border-t border-line pt-2 text-muted">{footer}</div>}
    </div>
  );
}
