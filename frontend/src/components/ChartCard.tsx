import { Suspense, useState, type CSSProperties, type ReactNode } from "react";

import { useNearViewport } from "../lib/useNearViewport";
import { EmptyState, ErrorState, ChartSkeleton } from "./states";
import { Button, Card, cx } from "./ui";

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
  /** Shape of the first-load skeleton. */
  shape?: "line" | "bars";
  /** Previous data is on screen while new data loads: dim it and show a progress hairline. */
  isRefreshing?: boolean;
  /** What the plot shows, for screen readers (the table view has the numbers). */
  ariaLabel?: string;
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
  shape = "line",
  isRefreshing = false,
  ariaLabel,
  children,
  className,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  // Charts below the fold mount when they come near the viewport, so first load renders less.
  const [plotRef, near] = useNearViewport<HTMLDivElement>();
  const ready = !error && !isLoading && !isEmpty;
  const skeleton = <ChartSkeleton label={`Loading ${title}`} height="100%" shape={shape} />;

  let body: ReactNode;
  if (error) body = <ErrorState error={error} onRetry={onRetry} />;
  else if (isEmpty) body = <EmptyState />;
  else if (showTable && table && ready)
    body = <div className="max-h-80 overflow-auto">{table()}</div>;
  else
    // Loading and loaded share one frame (unit row + fixed-height plot), so nothing shifts.
    body = (
      <>
        {unit && (
          <p aria-hidden="true" className="mb-1 font-mono text-micro text-muted">
            {unit}
          </p>
        )}
        {/* Phones get 80% of the height; the chart stays readable without dominating the screen. */}
        <div
          ref={plotRef}
          role="figure"
          aria-label={ariaLabel ?? title}
          className="h-[calc(var(--h)*0.8px)] sm:h-[calc(var(--h)*1px)]"
          style={{ "--h": height } as CSSProperties}
        >
          {isLoading || !near ? skeleton : <Suspense fallback={skeleton}>{children()}</Suspense>}
        </div>
      </>
    );

  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={cx("overflow-hidden", className)}
      aria-busy={isRefreshing || isLoading}
      actions={
        // Present while loading too (disabled), so the header keeps its height.
        table && !error && !isEmpty ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready}
            onClick={() => {
              setShowTable((v) => !v);
            }}
            aria-pressed={showTable}
          >
            {showTable ? "Show chart" : "Show table"}
          </Button>
        ) : undefined
      }
    >
      {isRefreshing && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="progress-bar h-px w-2/5 bg-accent" />
        </div>
      )}
      {legend && !showTable && !error && !isEmpty && <div className="mb-3">{legend}</div>}
      <div
        className={cx(
          "transition-opacity duration-[220ms] ease-[var(--ease-out-expo)]",
          isRefreshing ? "opacity-60" : "opacity-100",
        )}
      >
        {body}
      </div>
    </Card>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; kind?: "line" | "box" | "dash" | "band" }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-label text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              it.kind === "box"
                ? "h-2.5 w-2.5 rounded-[2px]"
                : it.kind === "band"
                  ? "h-2.5 w-4 rounded-[2px]"
                  : "h-0.5 w-4 rounded-full"
            }
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
    <table className="w-full text-left text-body">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-panel text-label text-muted">
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className="py-2 pr-4 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono text-label">
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line hover:bg-raised/60">
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
