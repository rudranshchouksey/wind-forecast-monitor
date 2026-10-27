import { useEffect, useRef, useState } from "react";

import { ApiError, isUnreachable } from "../api/client";
import { Button, Skeleton } from "./ui";

export { Skeleton };

/** Seconds to wait before each automatic retry while the API is unreachable (last one repeats). */
const RETRY_DELAYS_S = [2, 4, 8, 15, 30];

/**
 * While `active`, counts down and calls `onRetry` with backoff. Each new `error` object (a failed
 * retry) schedules the next attempt. Returns the seconds left, 0 while a retry is in flight.
 */
function useAutoRetry(active: boolean, error: unknown, onRetry?: () => void): number | null {
  const attempt = useRef(0);
  const retry = useRef(onRetry);
  retry.current = onRetry;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !retry.current) {
      setSecondsLeft(null);
      return;
    }
    let remaining = RETRY_DELAYS_S[Math.min(attempt.current, RETRY_DELAYS_S.length - 1)] ?? 30;
    setSecondsLeft(remaining);
    const id = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(id);
        attempt.current += 1;
        retry.current?.();
      }
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [active, error]);

  return secondsLeft;
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const unreachable = isUnreachable(error);
  const secondsLeft = useAutoRetry(unreachable, error, onRetry);
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const apiError = error instanceof ApiError ? error : undefined;
  const title = unreachable ? undefined : apiError?.title;
  return (
    <div
      role="alert"
      className="flex h-full min-h-44 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-raised text-ink-2"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          {unreachable ? (
            <path
              d="M2 6.5a9 9 0 0 1 12 0M4.5 9a5.5 5.5 0 0 1 7 0M7 11.5a2 2 0 0 1 2 0M2 2l12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M8 4.5v4M8 11h.01M8 1.5l6.5 12h-13L8 1.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
      <p className="text-heading font-semibold text-ink">Could not load this view</p>
      {title && title !== message && (
        <p className="text-body font-medium text-ink-2">
          {title} ({apiError?.status})
        </p>
      )}
      <p className="max-w-sm text-body text-ink-2">{message}</p>
      {secondsLeft !== null && (
        <p className="font-mono text-label text-muted" aria-live="polite">
          {secondsLeft > 0 ? `Retrying automatically in ${secondsLeft} s…` : "Retrying…"}
        </p>
      )}
      {onRetry && (
        <Button className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ message = "No hours to show for this selection." }) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-muted">
        <path
          d="M3 17h18M6 13l3-3 3 2 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 3"
        />
      </svg>
      <p className="text-body text-ink-2">{message}</p>
    </div>
  );
}

/** A generic loading block (role="status"), sized by its parent. */
export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="h-full min-h-40 p-2">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-full min-h-40 w-full" />
    </div>
  );
}

const BAR_HEIGHTS = [38, 52, 70, 88, 96, 80, 64, 50, 40, 30, 22, 16, 12, 9];

/** A chart-shaped skeleton: y-axis ticks, gridlines and a faint line or bars. */
export function ChartSkeleton({
  label,
  height = 280,
  shape = "line",
}: {
  label: string;
  height?: number | string;
  shape?: "line" | "bars";
}) {
  return (
    <div role="status" aria-live="polite" className="flex gap-3" style={{ height }}>
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true" className="flex w-6 flex-col justify-between py-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-2 w-5" />
        ))}
      </div>
      <div aria-hidden="true" className="relative flex-1 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="absolute inset-x-0 border-t border-line"
            style={{ top: `${(i / 4) * 92 + 2}%` }}
          />
        ))}
        {shape === "bars" ? (
          <div className="absolute inset-x-0 bottom-[6%] flex h-[86%] items-end gap-1.5">
            {BAR_HEIGHTS.map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <path
              d="M0 28 C 10 18, 18 30, 28 22 S 46 8, 56 16 S 74 30, 84 18 S 96 12, 100 14"
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
