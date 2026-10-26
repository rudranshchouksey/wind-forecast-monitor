import { useId, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingBlock } from "./states";

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  onRetry?: () => void;
  /** Accessible alternative: the same numbers as a table. */
  table?: () => ReactNode;
  legend?: ReactNode;
  /** Y-axis unit, shown above the plot's top-left corner (not inside the axis, where it collides). */
  unit?: string;
  height?: number;
  children: () => ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  isLoading,
  error,
  isEmpty,
  onRetry,
  table,
  legend,
  unit,
  height = 280,
  children,
  className = "",
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  let body: ReactNode;
  if (error) body = <ErrorState error={error} onRetry={onRetry} />;
  else if (isLoading) body = <LoadingBlock label={`Loading ${title}`} />;
  else if (isEmpty) body = <EmptyState />;
  else if (showTable && table) body = <div className="max-h-80 overflow-auto">{table()}</div>;
  else
    body = (
      <>
        {unit && (
          <p aria-hidden="true" className="mb-1 text-xs text-muted">
            {unit}
          </p>
        )}
        <div style={{ height }}>{children()}</div>
      </>
    );

  return (
    <section
      aria-labelledby={headingId}
      className={`min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5 ${className}`}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {table && !error && !isLoading && !isEmpty && (
          <button
            type="button"
            onClick={() => {
              setShowTable((v) => !v);
            }}
            aria-pressed={showTable}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </header>
      {legend && !showTable && <div className="mb-2">{legend}</div>}
      {body}
    </section>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; kind?: "line" | "box" | "dash" }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={it.kind === "box" ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-4 rounded-full"}
            style={
              it.kind === "dash"
                ? {
                    background: `repeating-linear-gradient(90deg, ${it.color} 0 5px, transparent 5px 8px)`,
                  }
                : { background: it.color }
            }
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="tabular w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-surface text-xs text-muted">
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className="py-1.5 pr-4 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {r.map((cell, j) => (
              <td key={j} className="py-1.5 pr-4 text-ink">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
