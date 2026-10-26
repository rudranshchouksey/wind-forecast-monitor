import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared tooltip body: title, then value-first rows keyed by short line swatches. */
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
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color ? (
              <span
                aria-hidden="true"
                className="h-0.5 w-3 rounded-full"
                style={{ background: r.color }}
              />
            ) : (
              <span aria-hidden="true" className="w-3" />
            )}
            <span className="tabular font-semibold text-ink">{r.value}</span>
            <span className="text-ink-2">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-ink-2">{footer}</div>}
    </div>
  );
}
